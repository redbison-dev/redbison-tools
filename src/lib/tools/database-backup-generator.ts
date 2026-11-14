import { msg } from '../msg';

export interface BackupConfig {
  dbType: 'mysql' | 'postgresql' | 'sqlite' | 'sqlserver' | 'oracle' | string;
  host: string;
  port: string;
  database: string;
  username: string;
  /** Include table definitions (DDL). */
  includeTables: boolean;
  /** Include row data. */
  includeData: boolean;
  /** MySQL only: keep triggers in the dump (mysqldump's default). */
  includeTriggers?: boolean;
  /** MySQL only: add stored procedures and functions (--routines). */
  includeRoutines?: boolean;
  compression: boolean;
  customOptions: string;
}

export interface BackupScripts {
  backup: string;
  restore: string;
  backupFileName: string;
}

export const DB_TYPES = [
  { value: 'mysql', label: 'MySQL / MariaDB', port: '3306' },
  { value: 'postgresql', label: 'PostgreSQL', port: '5432' },
  { value: 'sqlite', label: 'SQLite', port: '' },
  { value: 'sqlserver', label: 'SQL Server', port: '1433' },
  { value: 'oracle', label: 'Oracle (Data Pump)', port: '1521' },
];

/** Single-quotes a value for bash, so spaces and $ in names cannot break the script. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Escapes text for use inside a bash double-quoted string. */
export function bashDoubleQuoteEscape(value: string): string {
  return value.replace(/[\\"$`]/g, (c) => `\\${c}`);
}

/** T-SQL bracket-quoted identifier: ] is doubled. */
export function tsqlIdentifier(name: string): string {
  return `[${name.replace(/]/g, ']]')}]`;
}

/**
 * Oracle schema name for Data Pump. A plain identifier is upper-cased, as
 * Oracle does for unquoted names; anything else is double-quoted so case and
 * special characters such as ' are kept (" is doubled).
 */
export function oracleIdentifier(name: string): string {
  if (/^[A-Za-z][A-Za-z0-9_$#]*$/.test(name)) return name.toUpperCase();
  return `"${name.replace(/"/g, '""')}"`;
}

/** Characters safe in a file name on every OS; everything else becomes _. */
export function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, '_');
}

/**
 * Bash line that sets FILE_SQL to $FILE with ' doubled, so the path can sit
 * inside a T-SQL N'...' literal.
 */
const FILE_SQL_LINE = `FILE_SQL=$(printf '%s' "$FILE" | sed "s/'/''/g")`;

const TS = '$(date +%Y%m%d_%H%M%S)';

function check(config: BackupConfig) {
  if (!config.database.trim()) throw new Error(msg('Please enter a database name'));
  if (!config.includeTables && !config.includeData) throw new Error(msg('Select table structure, data, or both'));
}

function exitCheck(what: string) {
  return `STATUS=$?
if [ $STATUS -ne 0 ]; then
    echo "${what} failed with exit code $STATUS" >&2
    exit $STATUS
fi`;
}

function mysql(config: BackupConfig): BackupScripts {
  const ext = config.compression ? '.sql.gz' : '.sql';
  const opts = ['--single-transaction', '--quick'];
  if (!config.includeData) opts.push('--no-data');
  if (!config.includeTables) opts.push('--no-create-info');
  if (config.includeTriggers === false) opts.push('--skip-triggers');
  if (config.includeRoutines) opts.push('--routines', '--events');
  if (config.customOptions.trim()) opts.push(config.customOptions.trim());

  const header = (kind: string) => `#!/usr/bin/env bash
# MySQL ${kind} script
set -o pipefail

DB_HOST=${shellQuote(config.host)}
DB_PORT=${shellQuote(config.port)}
DB_NAME=${shellQuote(config.database)}
DB_USER=${shellQuote(config.username)}

# Keep the password out of the process list: write it to a private option
# file that only this script can read, and delete it on exit.
read -r -s -p "MySQL password for $DB_USER: " DB_PASS; echo
CNF=$(mktemp)
chmod 600 "$CNF"
trap 'rm -f "$CNF"' EXIT
printf '[client]\\npassword="%s"\\n' "$DB_PASS" > "$CNF"
unset DB_PASS
`;

  const backup = `${header('backup')}
BACKUP_DIR=/backup/mysql
FILE="$BACKUP_DIR/\${DB_NAME}_${TS}${ext}"
mkdir -p "$BACKUP_DIR"

echo "Backing up $DB_NAME to $FILE"
# --defaults-extra-file must be the first option.
mysqldump --defaults-extra-file="$CNF" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \\
  ${opts.join(' \\\n  ')} \\
  "$DB_NAME"${config.compression ? ' | gzip' : ''} > "$FILE"
${exitCheck('Backup')}

chmod 600 "$FILE"
ls -lh "$FILE"
`;

  const restore = `${header('restore')}
FILE="$1"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
    echo "Usage: $0 <backup${ext}>" >&2
    exit 1
fi

# The target database must already exist: CREATE DATABASE \`name\`;
echo "Restoring $FILE into $DB_NAME"
${config.compression ? 'gunzip -c "$FILE" | ' : ''}mysql --defaults-extra-file="$CNF" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME"${config.compression ? '' : ' < "$FILE"'}
${exitCheck('Restore')}
echo "Restore completed"
`;
  return { backup, restore, backupFileName: `${safeFilePart(config.database)}_backup.sh` };
}

function postgres(config: BackupConfig): BackupScripts {
  // Custom format (-Fc) is compressed by default and restored with pg_restore.
  const custom = config.compression;
  const ext = custom ? '.dump' : '.sql';
  const opts: string[] = [];
  if (custom) opts.push('--format=custom');
  if (!config.includeData) opts.push('--schema-only');
  if (!config.includeTables) opts.push('--data-only');
  opts.push('--no-owner');
  if (config.customOptions.trim()) opts.push(config.customOptions.trim());

  const header = (kind: string) => `#!/usr/bin/env bash
# PostgreSQL ${kind} script
# For unattended runs, put the password in ~/.pgpass (chmod 600) instead of typing it.

DB_HOST=${shellQuote(config.host)}
DB_PORT=${shellQuote(config.port)}
DB_NAME=${shellQuote(config.database)}
DB_USER=${shellQuote(config.username)}

read -r -s -p "PostgreSQL password for $DB_USER: " PGPASSWORD; echo
export PGPASSWORD
trap 'unset PGPASSWORD' EXIT
`;

  const backup = `${header('backup')}
BACKUP_DIR=/backup/postgresql
FILE="$BACKUP_DIR/\${DB_NAME}_${TS}${ext}"
mkdir -p "$BACKUP_DIR"

echo "Backing up $DB_NAME to $FILE"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \\
  ${opts.join(' \\\n  ')} \\
  --file="$FILE" \\
  "$DB_NAME"
${exitCheck('Backup')}

chmod 600 "$FILE"
ls -lh "$FILE"
`;

  const restoreCmd = custom
    ? `# --clean --if-exists drops objects before recreating them.
pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \\
  --clean --if-exists --no-owner --exit-on-error "$FILE"`
    : `psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \\
  --set ON_ERROR_STOP=1 --single-transaction -f "$FILE"`;

  const restore = `${header('restore')}
FILE="$1"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
    echo "Usage: $0 <backup${ext}>" >&2
    exit 1
fi

# The target database must already exist: createdb -h "$DB_HOST" -U "$DB_USER" "$DB_NAME"
echo "Restoring $FILE into $DB_NAME"
${restoreCmd}
${exitCheck('Restore')}
echo "Restore completed"
`;
  return { backup, restore, backupFileName: `${safeFilePart(config.database)}_backup.sh` };
}

function sqlite(config: BackupConfig): BackupScripts {
  // Keep the file name the user gave (app.sqlite3 stays app.sqlite3); add .db only when there is no extension.
  const dbFile = /\.(db|db3|sqlite3?)$/i.test(config.database) ? config.database : `${config.database}.db`;
  const schemaOnly = !config.includeData;
  const dataOnly = !config.includeTables;
  const ext = schemaOnly || dataOnly ? '.sql' : '.db';
  const gz = config.compression ? '.gz' : '';

  let dumpCmd: string;
  if (schemaOnly) {
    dumpCmd = `sqlite3 "$DB_FILE" .schema`;
  } else if (dataOnly) {
    // .dump --data-only needs a reasonably recent sqlite3 shell.
    dumpCmd = `sqlite3 "$DB_FILE" ".dump --data-only"`;
  } else {
    dumpCmd = '';
  }

  const backupBody = dumpCmd
    ? `${dumpCmd}${config.compression ? ' | gzip' : ''} > "$FILE"`
    : `# .backup uses SQLite's online backup API, so the copy is consistent even
# while other processes write (a plain cp can miss the -wal file).
sqlite3 "$DB_FILE" ".backup '$TMP'"${config.compression ? `
STATUS=$?
[ $STATUS -eq 0 ] && gzip -c "$TMP" > "$FILE" && rm -f "$TMP"` : ''}`;

  const backup = `#!/usr/bin/env bash
# SQLite backup script
set -o pipefail

DB_FILE=${shellQuote(dbFile)}  # adjust the path as needed
BACKUP_DIR=/backup/sqlite
BASE=$(basename "$DB_FILE")
FILE="$BACKUP_DIR/\${BASE%.*}_${TS}${ext}${gz}"
TMP="${'$'}{FILE%.gz}"
mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_FILE" ]; then
    echo "Database file not found: $DB_FILE" >&2
    exit 1
fi

echo "Backing up $DB_FILE to $FILE"
${backupBody}
${exitCheck('Backup')}

chmod 600 "$FILE"
ls -lh "$FILE"
`;

  const restoreBody =
    ext === '.sql'
      ? `# Load a schema-only dump into an empty file, and a data-only dump into a
# database that already has the tables.
${config.compression ? 'gunzip -c "$FILE" | sqlite3 "$DB_FILE"' : 'sqlite3 "$DB_FILE" < "$FILE"'}`
      : `${config.compression ? 'gunzip -c "$FILE" > "$DB_FILE.restore"' : 'cp "$FILE" "$DB_FILE.restore"'} && rm -f "$DB_FILE-wal" "$DB_FILE-shm" && mv "$DB_FILE.restore" "$DB_FILE"`;

  const restore = `#!/usr/bin/env bash
# SQLite restore script. Stop the application first.
set -o pipefail

DB_FILE=${shellQuote(dbFile)}
FILE="$1"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
    echo "Usage: $0 <backup${ext}${gz}>" >&2
    exit 1
fi

if [ -f "$DB_FILE" ]; then
    echo "Keeping a copy of the current database"
    cp "$DB_FILE" "$DB_FILE.before-restore.$(date +%Y%m%d_%H%M%S)"
fi

${restoreBody}
${exitCheck('Restore')}

sqlite3 "$DB_FILE" "PRAGMA integrity_check;"
`;
  return { backup, restore, backupFileName: `${safeFilePart(config.database)}_backup.sh` };
}

function sqlserver(config: BackupConfig): BackupScripts {
  const withOpts = ['INIT', 'CHECKSUM'];
  if (config.compression) withOpts.push('COMPRESSION');
  withOpts.push('STATS = 10');
  // Bracket-quoted for T-SQL, then escaped for the bash "..." around -Q.
  const ident = bashDoubleQuoteEscape(tsqlIdentifier(config.database));

  const header = (kind: string) => `#!/usr/bin/env bash
# SQL Server ${kind} script (sqlcmd, native .bak files)
# BACKUP and RESTORE run on the server: the path is on the SQL Server host and
# must be writable by the SQL Server service account.

DB_HOST=${shellQuote(config.host)}
DB_PORT=${shellQuote(config.port)}
DB_NAME=${shellQuote(config.database)}
DB_USER=${shellQuote(config.username)}

read -r -s -p "SQL Server password for $DB_USER: " SQLCMDPASSWORD; echo
export SQLCMDPASSWORD
trap 'unset SQLCMDPASSWORD' EXIT
`;

  const note = !config.includeData
    ? `# Note: a native BACKUP always contains schema and data. For a schema-only
# script, use SSMS "Generate Scripts" or: sqlpackage /Action:Extract
`
    : !config.includeTables
      ? `# Note: a native BACKUP always contains schema and data. For data only,
# export tables with bcp instead.
`
      : '';

  const backup = `${header('backup')}
BACKUP_DIR=/var/opt/mssql/backup
FILE="$BACKUP_DIR/${safeFilePart(config.database)}_${TS}.bak"
${FILE_SQL_LINE}
${note}${config.compression ? '# WITH COMPRESSION is not available on SQL Server Express.\n' : ''}
echo "Backing up $DB_NAME to $FILE on the server"
sqlcmd -S "$DB_HOST,$DB_PORT" -U "$DB_USER" -b -Q "BACKUP DATABASE ${ident} TO DISK = N'$FILE_SQL' WITH ${withOpts.join(', ')}"
${exitCheck('Backup')}

sqlcmd -S "$DB_HOST,$DB_PORT" -U "$DB_USER" -b -Q "RESTORE VERIFYONLY FROM DISK = N'$FILE_SQL' WITH CHECKSUM"
`;

  const restore = `${header('restore')}
FILE="$1"   # path of the .bak file on the SQL Server host
if [ -z "$FILE" ]; then
    echo "Usage: $0 /var/opt/mssql/backup/<file>.bak" >&2
    exit 1
fi
${FILE_SQL_LINE}

# WITH REPLACE overwrites the existing database. If the logical file paths
# differ on this server, add MOVE clauses (see RESTORE FILELISTONLY).
sqlcmd -S "$DB_HOST,$DB_PORT" -U "$DB_USER" -b -Q "RESTORE DATABASE ${ident} FROM DISK = N'$FILE_SQL' WITH REPLACE, RECOVERY, STATS = 10"
${exitCheck('Restore')}
echo "Restore completed"
`;
  return { backup, restore, backupFileName: `${safeFilePart(config.database)}_backup.sh` };
}

function oracle(config: BackupConfig): BackupScripts {
  const content = !config.includeData ? 'METADATA_ONLY' : !config.includeTables ? 'DATA_ONLY' : 'ALL';
  const schema = oracleIdentifier(config.username || 'APP_SCHEMA');
  // A user name that is not a plain identifier must be double-quoted in the
  // user@//host:port/service connect string too.
  const login = /^[A-Za-z][A-Za-z0-9_$#]*$/.test(config.username) || !config.username
    ? config.username
    : oracleIdentifier(config.username);
  // SCHEMAS goes in a parameter file written through a quoted heredoc, so the
  // shell leaves the identifier's double quotes and any ' untouched.
  const parfile = `PARFILE=$(mktemp)
trap 'rm -f "$PARFILE"' EXIT
cat > "$PARFILE" <<'PAR_EOF'
SCHEMAS=${schema}
PAR_EOF`;

  const header = (kind: string) => `#!/usr/bin/env bash
# Oracle ${kind} script (Data Pump)
# Data Pump writes on the database server, into the DIRECTORY object below.
# The tool prompts for the password; DB_SERVICE is the service name, e.g. ORCLPDB1.

DB_HOST=${shellQuote(config.host)}
DB_PORT=${shellQuote(config.port)}
DB_SERVICE=${shellQuote(config.database)}
DB_USER=${shellQuote(login)}
SCHEMA=${shellQuote(safeFilePart(schema.replace(/"/g, '')))}  # used in file names only
DIRECTORY=DATA_PUMP_DIR

${parfile}
`;

  const backup = `${header('backup')}
STAMP=${TS}
DUMPFILE="\${SCHEMA}_\${STAMP}.dmp"
${config.compression ? '# COMPRESSION=ALL needs the Advanced Compression option (Enterprise Edition).\n' : ''}
expdp "$DB_USER@//$DB_HOST:$DB_PORT/$DB_SERVICE" \\
  PARFILE="$PARFILE" \\
  DIRECTORY="$DIRECTORY" \\
  DUMPFILE="$DUMPFILE" \\
  LOGFILE="\${SCHEMA}_\${STAMP}_exp.log" \\
  CONTENT=${content}${config.compression ? ' \\\n  COMPRESSION=ALL' : ''}${config.customOptions.trim() ? ` \\\n  ${config.customOptions.trim()}` : ''}
${exitCheck('Export')}
echo "Dump written to $DUMPFILE in directory $DIRECTORY"
`;

  const restore = `${header('restore')}
DUMPFILE="$1"   # file name inside DATA_PUMP_DIR, not a local path
if [ -z "$DUMPFILE" ]; then
    echo "Usage: $0 <file.dmp>" >&2
    exit 1
fi

impdp "$DB_USER@//$DB_HOST:$DB_PORT/$DB_SERVICE" \\
  PARFILE="$PARFILE" \\
  DIRECTORY="$DIRECTORY" \\
  DUMPFILE="$DUMPFILE" \\
  LOGFILE="\${SCHEMA}_imp.log" \\
  TABLE_EXISTS_ACTION=REPLACE
${exitCheck('Import')}
echo "Import completed"
`;
  return { backup, restore, backupFileName: `${safeFilePart(config.database)}_backup.sh` };
}

export function generateBackupScripts(config: BackupConfig): BackupScripts {
  check(config);
  switch (config.dbType) {
    case 'mysql':
      return mysql(config);
    case 'postgresql':
      return postgres(config);
    case 'sqlite':
      return sqlite(config);
    case 'sqlserver':
      return sqlserver(config);
    case 'oracle':
      return oracle(config);
    default:
      throw new Error(`Unsupported database type: ${config.dbType}`);
  }
}
