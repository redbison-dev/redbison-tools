# Tool list

All 116 tools in this repo, grouped as on the home page. Each row links the
tool's React component; the pure logic it calls lives in [src/lib/tools/](src/lib/tools/)
(see [ARCHITECTURE.md](ARCHITECTURE.md)). "Try it" opens the hosted version at redbison.dev.

This file is generated from the catalog — do not edit by hand.

## Text Processing

| Tool | What it does | Source | Try |
|---|---|---|---|
| **Online Text Processor** | Clean, format and manipulate text | [`TextTools.tsx`](src/components/tools/TextTools.tsx) | [Try it](https://redbison.dev/online-text-processor) |
| **Remove Duplicate Lines** | Remove duplicate lines from text | [`RemoveDuplicateLines.tsx`](src/components/tools/RemoveDuplicateLines.tsx) | [Try it](https://redbison.dev/remove-duplicate-lines) |
| **Find Duplicate Entries** | Find and analyze duplicate entries in text | [`FindDuplicateEntries.tsx`](src/components/tools/FindDuplicateEntries.tsx) | [Try it](https://redbison.dev/find-duplicate-entries) |
| **Remove Extra Spaces** | Clean extra spaces from text | [`RemoveExtraSpaces.tsx`](src/components/tools/RemoveExtraSpaces.tsx) | [Try it](https://redbison.dev/remove-extra-spaces) |
| **Remove Empty Lines** | Remove empty and blank lines | [`RemoveEmptyLines.tsx`](src/components/tools/RemoveEmptyLines.tsx) | [Try it](https://redbison.dev/remove-empty-lines) |
| **Case Converter** | Convert text case formats | [`CaseConverter.tsx`](src/components/tools/CaseConverter.tsx) | [Try it](https://redbison.dev/case-converter) |
| **Lines to Comma** | Convert lines to comma separated | [`LinesToComma.tsx`](src/components/tools/LinesToComma.tsx) | [Try it](https://redbison.dev/lines-to-comma) |
| **Comma to Lines** | Convert comma separated to lines | [`CommaToLines.tsx`](src/components/tools/CommaToLines.tsx) | [Try it](https://redbison.dev/comma-to-lines) |
| **Escape Characters Tool** | Add or remove escape characters | [`RemoveEscapeCharacters.tsx`](src/components/tools/RemoveEscapeCharacters.tsx) | [Try it](https://redbison.dev/escape-characters) |
| **Regex Tester** | Test and debug regular expressions | [`RegexTester.tsx`](src/components/tools/RegexTester.tsx) | [Try it](https://redbison.dev/regex-tester) |
| **Word Cloud Generator** | Create visual word clouds from text | [`WordCloudGenerator.tsx`](src/components/tools/WordCloudGenerator.tsx) | [Try it](https://redbison.dev/word-cloud-generator) |

## Diff Tools

| Tool | What it does | Source | Try |
|---|---|---|---|
| **List Comparison Tool** | Compare two lists to find differences and similarities | [`ListComparison.tsx`](src/components/tools/ListComparison.tsx) | [Try it](https://redbison.dev/list-comparison) |
| **Online Diff Tool** | Compare two texts side-by-side with highlighted differences, just like Beyond Compare | [`OnlineDiffTool.tsx`](src/components/tools/OnlineDiffTool.tsx) | [Try it](https://redbison.dev/online-diff-tool) |

## Code Formatters

| Tool | What it does | Source | Try |
|---|---|---|---|
| **SQL Beautifier** | Format and beautify SQL queries | [`SqlBeautifier.tsx`](src/components/tools/SqlBeautifier.tsx) | [Try it](https://redbison.dev/sql-beautify) |
| **HTML Beautifier** | Format and beautify HTML code | [`HtmlBeautifier.tsx`](src/components/tools/HtmlBeautifier.tsx) | [Try it](https://redbison.dev/html-beautify) |
| **YAML Beautifier** | Format and beautify YAML files | [`YamlBeautifier.tsx`](src/components/tools/YamlBeautifier.tsx) | [Try it](https://redbison.dev/yaml-beautify) |
| **XML Beautifier** | Format and beautify XML documents | [`XmlBeautifier.tsx`](src/components/tools/XmlBeautifier.tsx) | [Try it](https://redbison.dev/xml-beautify) |
| **JavaScript Beautifier & Minifier** | Format or minify JavaScript and TypeScript | [`JavascriptBeautifier.tsx`](src/components/tools/devformat/JavascriptBeautifier.tsx) | [Try it](https://redbison.dev/javascript-beautifier) |
| **CSS Beautifier & Minifier** | Format, minify and sort CSS, SCSS and Less | [`CssBeautifier.tsx`](src/components/tools/devformat/CssBeautifier.tsx) | [Try it](https://redbison.dev/css-beautifier) |

## Data Conversion

| Tool | What it does | Source | Try |
|---|---|---|---|
| **JSON Formatter** | Format, minify, validate and query JSON documents | [`JsonBeautifier.tsx`](src/components/tools/JsonBeautifier.tsx) | [Try it](https://redbison.dev/json-beautify-validate-query) |
| **JSON to TypeScript Generator** | Generate TypeScript interfaces from any JSON payload | [`JsonToTypescriptGenerator.tsx`](src/components/tools/JsonToTypescriptGenerator.tsx) | [Try it](https://redbison.dev/json-to-typescript-generator) |
| **Binary to Text Converter** | Text to binary or hex bytes and back with real UTF-8 handling | [`BinaryTextConverter.tsx`](src/components/tools/converters/pages/BinaryTextConverter.tsx) | [Try it](https://redbison.dev/binary-text-converter) |
| **XML to JSON Converter** | Validate XML and convert it to JSON with attributes preserved | [`XmlToJsonConverter.tsx`](src/components/tools/converters/pages/XmlToJsonConverter.tsx) | [Try it](https://redbison.dev/xml-to-json-converter) |
| **Markdown to HTML Converter** | Markdown to clean HTML with GitHub extensions and a sandboxed preview | [`MarkdownToHtmlConverter.tsx`](src/components/tools/converters/pages/MarkdownToHtmlConverter.tsx) | [Try it](https://redbison.dev/markdown-to-html-converter) |
| **HTML to Markdown Converter** | HTML from pages or a CMS turned into tidy Markdown for docs and READMEs | [`HtmlToMarkdownConverter.tsx`](src/components/tools/converters/pages/HtmlToMarkdownConverter.tsx) | [Try it](https://redbison.dev/html-to-markdown-converter) |
| **CSV to JSON** | Convert CSV data to JSON format | [`CsvJsonConverter.tsx`](src/components/tools/CsvJsonConverter.tsx) | [Try it](https://redbison.dev/csv-json) |
| **JSON to YAML** | Convert between JSON and YAML formats | [`JsonYamlConverter.tsx`](src/components/tools/JsonYamlConverter.tsx) | [Try it](https://redbison.dev/json-yaml) |
| **Excel to JSON Converter** | Convert Excel (.xlsx, .xls) and CSV files to JSON format instantly | [`ExcelToJsonConverter.tsx`](src/components/tools/ExcelToJsonConverter.tsx) | [Try it](https://redbison.dev/excel-to-json-converter) |
| **Data Visualization Tool** | Create beautiful charts from CSV data with multiple visualization types | [`DataVisualizationTool.tsx`](src/components/tools/DataVisualizationTool.tsx) | [Try it](https://redbison.dev/data-visualization-tool) |
| **JSON Schema Validator & Generator** | Validate JSON against a schema or infer a schema from a sample | [`JsonSchemaValidator.tsx`](src/components/tools/devformat/JsonSchemaValidator.tsx) | [Try it](https://redbison.dev/json-schema-validator) |
| **TOML Converter** | Convert TOML to JSON or YAML and back, with validation | [`TomlConverter.tsx`](src/components/tools/devformat/TomlConverter.tsx) | [Try it](https://redbison.dev/toml-converter) |
| **cURL to Code Converter** | Turn a curl command into fetch, Axios, Python, Go or PHP | [`CurlConverter.tsx`](src/components/tools/devformat/CurlConverter.tsx) | [Try it](https://redbison.dev/curl-converter) |
| **Markdown Table Generator** | Build Markdown tables or convert CSV and spreadsheets to them | [`MarkdownTableGenerator.tsx`](src/components/tools/devformat/MarkdownTableGenerator.tsx) | [Try it](https://redbison.dev/markdown-table-generator) |

## Security Tools

| Tool | What it does | Source | Try |
|---|---|---|---|
| **Hash Generator** | Generate MD5, SHA, and other hashes | [`HashGenerator.tsx`](src/components/tools/HashGenerator.tsx) | [Try it](https://redbison.dev/hash-generator) |
| **Password Generator** | Generate secure random passwords | [`PasswordGenerator.tsx`](src/components/tools/PasswordGenerator.tsx) | [Try it](https://redbison.dev/password-generator) |
| **Bcrypt Hash Generator** | Generate and verify bcrypt password hashes | [`BcryptHashGenerator.tsx`](src/components/tools/BcryptHashGenerator.tsx) | [Try it](https://redbison.dev/bcrypt-hash-generator) |
| **Htpasswd Generator** | Create Apache .htpasswd entries with bcrypt, APR1-MD5 or SHA-1 | [`HtpasswdGenerator.tsx`](src/components/tools/HtpasswdGenerator.tsx) | [Try it](https://redbison.dev/htpasswd-generator) |
| **JWT Decoder** | Decode and verify JWT tokens | [`JwtTool.tsx`](src/components/tools/JwtTool.tsx) | [Try it](https://redbison.dev/jwt-decoder) |
| **SSL Checker** | Check certificate expiry, hostname and chain order from a pasted chain | [`SslChecker.tsx`](src/components/tools/SslChecker.tsx) | [Try it](https://redbison.dev/ssl-checker) |
| **Security Headers Analyzer** | Grade HTTP security headers like CSP and HSTS from pasted headers | [`SecurityHeadersAnalyzer.tsx`](src/components/tools/SecurityHeadersAnalyzer.tsx) | [Try it](https://redbison.dev/security-headers-analyzer) |
| **JWK Tool** | JSON Web Key utilities | [`JwkTool.tsx`](src/components/tools/JwkTool.tsx) | [Try it](https://redbison.dev/jwk-tool) |
| **X.509 Parser** | Parse X.509 certificates | [`X509Parser.tsx`](src/components/tools/X509Parser.tsx) | [Try it](https://redbison.dev/x509-parser) |
| **SQL Injection Tester** | Test for SQL injection vulnerabilities | [`SqlInjectionTester.tsx`](src/components/tools/SqlInjectionTester.tsx) | [Try it](https://redbison.dev/sql-injection-tester) |
| **SAML Tool** | SAML assertion utilities and validator | [`SamlTool.tsx`](src/components/tools/SamlTool.tsx) | [Try it](https://redbison.dev/saml-tool) |
| **Hash File Verifier** | Verify file integrity using hash checksums | [`HashFileVerifier.tsx`](src/components/tools/HashFileVerifier.tsx) | [Try it](https://redbison.dev/hash-file-verifier) |
| **Digital Signature Validator** | Validate digital signatures and certificates | [`DigitalSignatureValidator.tsx`](src/components/tools/DigitalSignatureValidator.tsx) | [Try it](https://redbison.dev/digital-signature-validator) |
| **Security Threat Checklist** | Browse 22 common threat classes and export a Markdown checklist | [`SecurityChecklist.tsx`](src/components/tools/SecurityChecklist.tsx) | [Try it](https://redbison.dev/security-checklist) |
| **Password Strength Checker** | Entropy, crack time and weaknesses of a password, offline | [`PasswordStrengthChecker.tsx`](src/components/tools/security2/PasswordStrengthChecker.tsx) | [Try it](https://redbison.dev/password-strength-checker) |
| **TOTP / 2FA Code Generator** | Generate and verify 2FA codes from a secret or otpauth URI | [`TotpGenerator.tsx`](src/components/tools/security2/TotpGenerator.tsx) | [Try it](https://redbison.dev/totp-generator) |
| **HMAC Generator** | HMAC-SHA256, SHA-1, SHA-384 and SHA-512 in hex or Base64 | [`HmacGenerator.tsx`](src/components/tools/security2/HmacGenerator.tsx) | [Try it](https://redbison.dev/hmac-generator) |
| **AES Encrypt & Decrypt** | AES-GCM and AES-CBC text encryption with a password or key | [`AesEncryption.tsx`](src/components/tools/security2/AesEncryption.tsx) | [Try it](https://redbison.dev/aes-encryption) |
| **RSA & EC Key Pair Generator** | RSA and ECDSA key pairs in PEM, JWK and OpenSSH | [`RsaKeyGenerator.tsx`](src/components/tools/security2/RsaKeyGenerator.tsx) | [Try it](https://redbison.dev/rsa-key-generator) |

## Database Tools

| Tool | What it does | Source | Try |
|---|---|---|---|
| **SQL Query Builder** | Build SQL queries with visual interface | [`SqlQueryBuilder.tsx`](src/components/tools/SqlQueryBuilder.tsx) | [Try it](https://redbison.dev/sql-query-builder) |
| **Database Schema Designer** | Design and visualize database schemas | [`DatabaseSchemaDesigner.tsx`](src/components/tools/DatabaseSchemaDesigner.tsx) | [Try it](https://redbison.dev/database-schema-designer) |
| **SQL Query Analyzer** | Analyze and optimize SQL query performance | [`SqlQueryAnalyzer.tsx`](src/components/tools/SqlQueryAnalyzer.tsx) | [Try it](https://redbison.dev/sql-query-analyzer) |
| **SQL Explain Visualizer** | Visualize PostgreSQL EXPLAIN plans | [`SqlExplainVisualizer.tsx`](src/components/tools/SqlExplainVisualizer.tsx) | [Try it](https://redbison.dev/sql-explain-visualizer) |
| **Database ERD Generator** | Generate Entity Relationship Diagrams | [`DatabaseErdGenerator.tsx`](src/components/tools/DatabaseErdGenerator.tsx) | [Try it](https://redbison.dev/database-erd-generator) |
| **SQL Index Optimizer** | Suggest composite indexes from a query's filters, joins and sort | [`SqlIndexOptimizer.tsx`](src/components/tools/SqlIndexOptimizer.tsx) | [Try it](https://redbison.dev/sql-index-optimizer) |
| **Database Backup Generator** | Generate database backup scripts and strategies | [`DatabaseBackupGenerator.tsx`](src/components/tools/DatabaseBackupGenerator.tsx) | [Try it](https://redbison.dev/database-backup-generator) |
| **SQL Data Type Converter** | Convert data types between different database systems | [`SqlDataTypeConverter.tsx`](src/components/tools/SqlDataTypeConverter.tsx) | [Try it](https://redbison.dev/sql-data-type-converter) |
| **Database Seed Generator** | Generate test data and seed scripts for databases | [`DatabaseSeedGenerator.tsx`](src/components/tools/DatabaseSeedGenerator.tsx) | [Try it](https://redbison.dev/database-seed-generator) |
| **SQLite File Inspector** | Header facts, schema and exact row counts from a .sqlite or .db file | [`SqliteFileInspector.tsx`](src/components/tools/database/SqliteFileInspector.tsx) | [Try it](https://redbison.dev/sqlite-file-inspector) |

## API Tools

| Tool | What it does | Source | Try |
|---|---|---|---|
| **API Tester** | Send real HTTP requests and copy them as cURL | [`ApiTester.tsx`](src/components/tools/ApiTester.tsx) | [Try it](https://redbison.dev/api-tester) |
| **GraphQL Playground** | Test and explore GraphQL APIs | [`GraphqlPlayground.tsx`](src/components/tools/GraphqlPlayground.tsx) | [Try it](https://redbison.dev/graphql-playground) |
| **GraphQL Query Builder** | Build GraphQL queries visually | [`GraphqlQueryBuilder.tsx`](src/components/tools/GraphqlQueryBuilder.tsx) | [Try it](https://redbison.dev/graphql-query-builder) |
| **GraphQL Schema Formatter** | Format and beautify GraphQL schemas | [`GraphqlSchemaFormatter.tsx`](src/components/tools/GraphqlSchemaFormatter.tsx) | [Try it](https://redbison.dev/graphql-schema-formatter) |
| **GraphQL Schema Validator** | Validate GraphQL schema syntax and structure | [`GraphqlSchemaValidator.tsx`](src/components/tools/GraphqlSchemaValidator.tsx) | [Try it](https://redbison.dev/graphql-schema-validator) |
| **GraphQL TypeScript Generator** | Generate TypeScript types from GraphQL schemas | [`GraphqlTypescriptGenerator.tsx`](src/components/tools/GraphqlTypescriptGenerator.tsx) | [Try it](https://redbison.dev/graphql-typescript-generator) |
| **GraphQL Complexity Analyzer** | Analyze GraphQL query complexity and performance | [`GraphqlComplexityAnalyzer.tsx`](src/components/tools/GraphqlComplexityAnalyzer.tsx) | [Try it](https://redbison.dev/graphql-complexity-analyzer) |

## Network Tools

| Tool | What it does | Source | Try |
|---|---|---|---|
| **IP Address Info** | Get detailed IP address information | [`IpAddressTool.tsx`](src/components/tools/IpAddressTool.tsx) | [Try it](https://redbison.dev/ip-address) |
| **IP Address Lookup** | Get detailed information about IP addresses | [`IpAddressLookup.tsx`](src/components/tools/IpAddressLookup.tsx) | [Try it](https://redbison.dev/ip-address-lookup) |
| **DNS Lookup** | DNS record lookup and analysis | [`DnsLookup.tsx`](src/components/tools/DnsLookup.tsx) | [Try it](https://redbison.dev/dns-lookup) |
| **Subnet Calculator** | Calculate network subnets and CIDR | [`SubnetCalculator.tsx`](src/components/tools/SubnetCalculator.tsx) | [Try it](https://redbison.dev/subnet-calculator) |
| **Port Scanner** | Simulated port scan results for learning how real scanners work | [`PortScanner.tsx`](src/components/tools/PortScanner.tsx) | [Try it](https://redbison.dev/port-scanner) |
| **MAC Address Lookup** | Look up MAC address vendor information | [`MacAddressLookup.tsx`](src/components/tools/MacAddressLookup.tsx) | [Try it](https://redbison.dev/mac-address-lookup) |
| **IP Converter** | Convert IPv4 addresses between dotted, integer, hex and binary | [`IpConverter.tsx`](src/components/tools/IpConverter.tsx) | [Try it](https://redbison.dev/ip-converter) |
| **Network Tools** | Your public IP, ISP and browser connection details | [`NetworkTools.tsx`](src/components/tools/NetworkTools.tsx) | [Try it](https://redbison.dev/network-tools) |

## Data Formats

| Tool | What it does | Source | Try |
|---|---|---|---|
| **Binary Hex Editor** | View and edit file bytes as hex, binary and text | [`BinaryHexEditor.tsx`](src/components/tools/BinaryHexEditor.tsx) | [Try it](https://redbison.dev/binary-hex-editor) |
| **Text Encoding Converter** | Convert between different text encodings | [`TextEncodingConverter.tsx`](src/components/tools/TextEncodingConverter.tsx) | [Try it](https://redbison.dev/text-encoding-converter) |
| **Avro Tools** | Work with Apache Avro data serialization | [`AvroTools.tsx`](src/components/tools/AvroTools.tsx) | [Try it](https://redbison.dev/avro-tools) |
| **Protocol Buffers Tools** | Work with Protocol Buffers (protobuf) data | [`ProtobufTools.tsx`](src/components/tools/ProtobufTools.tsx) | [Try it](https://redbison.dev/protobuf-tools) |
| **Compression Tools** | Compress and decompress data using various algorithms | [`CompressionTools.tsx`](src/components/tools/CompressionTools.tsx) | [Try it](https://redbison.dev/compression-tools) |
| **Compression Comparison** | Compare different compression algorithms and ratios | [`CompressionComparison.tsx`](src/components/tools/CompressionComparison.tsx) | [Try it](https://redbison.dev/compression-comparison) |
| **Data Format Comparison** | Compare different data formats and their characteristics | [`DataFormatComparison.tsx`](src/components/tools/DataFormatComparison.tsx) | [Try it](https://redbison.dev/data-format-comparison) |
| **Parquet Viewer** | Read a Parquet file's schema, row count and codecs | [`ParquetViewer.tsx`](src/components/tools/ParquetViewer.tsx) | [Try it](https://redbison.dev/parquet-viewer) |
| **TSV Parser** | Parse and convert Tab-Separated Values files | [`TsvParser.tsx`](src/components/tools/TsvParser.tsx) | [Try it](https://redbison.dev/tsv-parser) |
| **Protobuf Wire Decoder** | Decode protobuf bytes without a schema, every plausible reading shown | [`ProtobufWireDecoder.tsx`](src/components/tools/dataformats/ProtobufWireDecoder.tsx) | [Try it](https://redbison.dev/protobuf-wire-decoder) |
| **MessagePack Decoder** | Turn MessagePack bytes into JSON with int64, binary and extensions visible | [`MessagePackDecoder.tsx`](src/components/tools/dataformats/MessagePackDecoder.tsx) | [Try it](https://redbison.dev/messagepack-decoder) |
| **CBOR Decoder** | Decode CBOR hex or base64 to JSON, tags and half-floats included | [`CborDecoder.tsx`](src/components/tools/dataformats/CborDecoder.tsx) | [Try it](https://redbison.dev/cbor-decoder) |

## Blockchain Tools

| Tool | What it does | Source | Try |
|---|---|---|---|
| **Ethereum Transaction Decoder** | Decode raw signed Ethereum transactions (legacy and typed) | [`EthereumTransactionDecoder.tsx`](src/components/tools/EthereumTransactionDecoder.tsx) | [Try it](https://redbison.dev/ethereum-transaction-decoder) |
| **Number Base Converter** | Convert binary, octal, decimal, hex and any base 2 to 36, with two's complement | [`NumberBaseConverter.tsx`](src/components/tools/dataformats/NumberBaseConverter.tsx) | [Try it](https://redbison.dev/number-base-converter) |
| **Smart Contract ABI Decoder** | Decode smart contract ABI and function calls | [`SmartContractAbiDecoder.tsx`](src/components/tools/SmartContractAbiDecoder.tsx) | [Try it](https://redbison.dev/smart-contract-abi-decoder) |
| **IEEE 754 Float Converter** | See the sign, exponent and fraction bits of half, single and double floats | [`Ieee754FloatConverter.tsx`](src/components/tools/dataformats/Ieee754FloatConverter.tsx) | [Try it](https://redbison.dev/ieee-754-float-converter) |

## Documentation & Review

| Tool | What it does | Source | Try |
|---|---|---|---|
| **Code Commit Message Tool** | Generate git commit messages following conventional standards | [`CodeCommitMessageTool.tsx`](src/components/tools/CodeCommitMessageTool.tsx) | [Try it](https://redbison.dev/code-commit-message-tool) |

## Time Tools

| Tool | What it does | Source | Try |
|---|---|---|---|
| **Epoch Converter** | Convert Unix timestamps to dates | [`EpochConverter.tsx`](src/components/tools/EpochConverter.tsx) | [Try it](https://redbison.dev/epoch-converter) |
| **Timezone Converter** | Convert time between different timezones | [`TimezoneConverter.tsx`](src/components/tools/TimezoneConverter.tsx) | [Try it](https://redbison.dev/timezone-converter) |

## Web & DevOps

| Tool | What it does | Source | Try |
|---|---|---|---|
| **HTTP Status Codes** | Every HTTP status code with meaning, RFC and when to use it | [`HttpStatusCodes.tsx`](src/components/tools/webops/HttpStatusCodes.tsx) | [Try it](https://redbison.dev/http-status-codes) |
| **MIME Type Lookup** | Find the MIME type for a file extension or the reverse | [`MimeTypeLookup.tsx`](src/components/tools/webops/MimeTypeLookup.tsx) | [Try it](https://redbison.dev/mime-type-lookup) |
| **User Agent Parser** | Browser, OS, device and bot detection from a user agent | [`UserAgentParser.tsx`](src/components/tools/webops/UserAgentParser.tsx) | [Try it](https://redbison.dev/user-agent-parser) |
| **Cron Expression Generator** | Build a cron schedule from plain choices and preview runs | [`CronExpressionGenerator.tsx`](src/components/tools/webops/CronExpressionGenerator.tsx) | [Try it](https://redbison.dev/cron-expression-generator) |
| **Redirect Rules Generator** | 301 and 302 rules for .htaccess, Nginx, Netlify and Vercel | [`RedirectGenerator.tsx`](src/components/tools/webops/RedirectGenerator.tsx) | [Try it](https://redbison.dev/redirect-generator) |
| **Docker Run to Compose Converter** | Convert docker run commands to docker-compose.yml and back | [`DockerRunToCompose.tsx`](src/components/tools/webops/DockerRunToCompose.tsx) | [Try it](https://redbison.dev/docker-run-to-compose) |
| **.gitignore Generator** | Combine .gitignore templates for languages, IDEs and OSes | [`GitignoreGenerator.tsx`](src/components/tools/webops/GitignoreGenerator.tsx) | [Try it](https://redbison.dev/gitignore-generator) |
| **Chmod Calculator** | Unix permissions between octal, symbolic and checkboxes | [`ChmodCalculator.tsx`](src/components/tools/webops/ChmodCalculator.tsx) | [Try it](https://redbison.dev/chmod-calculator) |

## Debugging

| Tool | What it does | Source | Try |
|---|---|---|---|
| **Java Thread Dump Analyzer** | Deadlocks, lock contention, pools and CPU from jstack or jcmd output | [`JavaThreadDumpAnalyzer.tsx`](src/components/tools/debugging/JavaThreadDumpAnalyzer.tsx) | [Try it](https://redbison.dev/java-thread-dump-analyzer) |
| **Java Heap Dump Analyzer** | Class histogram, biggest objects and duplicate arrays from an .hprof file | [`JavaHeapDumpAnalyzer.tsx`](src/components/tools/debugging/JavaHeapDumpAnalyzer.tsx) | [Try it](https://redbison.dev/java-heap-dump-analyzer) |
| **Heap Snapshot Analyzer** | Constructors, duplicate strings and detached DOM nodes from a .heapsnapshot | [`NodeHeapSnapshotAnalyzer.tsx`](src/components/tools/debugging/NodeHeapSnapshotAnalyzer.tsx) | [Try it](https://redbison.dev/node-heap-snapshot-analyzer) |
| **HAR File Analyzer** | Totals, third-party share and slow requests from a HAR export | [`HarAnalyzer.tsx`](src/components/tools/debugging/HarAnalyzer.tsx) | [Try it](https://redbison.dev/har-analyzer) |
| **Java GC Log Analyzer** | Pause percentiles, throughput and heap trend from a JVM GC log | [`GcLogAnalyzer.tsx`](src/components/tools/debugging/GcLogAnalyzer.tsx) | [Try it](https://redbison.dev/gc-log-analyzer) |
| **ZIP File Inspector** | List a ZIP, JAR, APK or DOCX from its index, nothing extracted | [`ZipFileInspector.tsx`](src/components/tools/debugging/ZipFileInspector.tsx) | [Try it](https://redbison.dev/zip-file-inspector) |
| **WASM Module Inspector** | Sections, imports, exports and memory pages from a .wasm file | [`WasmModuleInspector.tsx`](src/components/tools/debugging/WasmModuleInspector.tsx) | [Try it](https://redbison.dev/wasm-module-inspector) |
| **pprof Profile Analyzer** | Sample types, duration and top functions from a pprof file | [`PprofProfileAnalyzer.tsx`](src/components/tools/debugging/PprofProfileAnalyzer.tsx) | [Try it](https://redbison.dev/pprof-profile-analyzer) |
| **Executable File Inspector** | Architecture, libraries and segments of ELF, Mach-O and PE binaries | [`ExecutableFileInspector.tsx`](src/components/tools/debugging/ExecutableFileInspector.tsx) | [Try it](https://redbison.dev/executable-file-inspector) |
| **PCAP File Inspector** | Protocols, talkers, DNS and unanswered SYNs from a .pcap or .pcapng | [`PcapFileInspector.tsx`](src/components/tools/debugging/PcapFileInspector.tsx) | [Try it](https://redbison.dev/pcap-file-inspector) |
| **Arrow File Inspector** | Schema, record batches, exact row counts and compression from an Arrow IPC file | [`ArrowFileInspector.tsx`](src/components/tools/debugging/ArrowFileInspector.tsx) | [Try it](https://redbison.dev/arrow-file-inspector) |

## Design Tools

| Tool | What it does | Source | Try |
|---|---|---|---|
| **Font File Inspector** | Glyphs, tables and embedding permissions from a TTF, OTF or TTC | [`FontFileInspector.tsx`](src/components/tools/design/FontFileInspector.tsx) | [Try it](https://redbison.dev/font-file-inspector) |
