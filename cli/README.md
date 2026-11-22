# redbison

The [redbison.dev](https://redbison.dev) tools in your terminal. 100 developer utilities, 89 of
them never touching the network.

```console
$ echo '{"b":1,"a":2}' | redbison json-format
{
  "b": 1,
  "a": 2
}
```

The same tools as [redbison.dev](https://redbison.dev) and the [VS Code and JetBrains
plugins](https://redbison.dev/plugins), reading standard input and writing standard output so
they compose with everything else you already use.

## Install

```sh
npm install -g @redbison/cli
```

Then check it works:

```sh
redbison --version
```

No account, no key, no config file. `rb` is installed as a shorter alias for the same thing.

<details>
<summary>Other ways</summary>

Run it once without installing:

```sh
npx @redbison/cli json-format package.json
```

With pnpm or yarn:

```sh
pnpm add -g @redbison/cli
yarn global add @redbison/cli
```

Node 18 or newer is required. That is the only dependency.

</details>

## The picker

Run `redbison` with nothing after it and you get a full-screen picker:

```
 Catalogue: redbison.dev           <0> all tools                  ███  ████ ███  ███  ███   ███ ███  █  █
 Tools:     100 + 9 extras         <1> Data and JSON              █  █ █    █  █ █  █  █   █    █  █ ██ █
 Showing:   all tools [2]          <2> Text                       ███  ███  █  █ ███   █   ███  █  █ █ ██
 Filter:    /b64                   <3> Encoding and hashing       █ █  █    █  █ █  █  █      █ █  █ █  █     █
 Offline:   off                    <4> Formatters                 █  █ █    █  █ █  █  █      █ █  █ █  █   █▀█ █▀█ █ █
 Version:   0.3.2                  <f> categories & extras        █  █ ████ ███  ███  ███  ███  ███  █  █ ▄ █▄█ ▀█▄ ▀▄▀

┌─ Tools(all)[2] /b64 ─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ NAME                   CATEGORY              WHAT IT DOES                                                            │
│ base64-decode          Encoding and hashing  Decode the selected Base64.                                             │
│ base64-encode          Encoding and hashing  Encode the selection as Base64.                                         │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
<tools>
```

- `/` searches as you type, by keyword as well as by name: `unix timestamp` finds epoch,
  `pretty print` finds the formatters, `b64` finds base64-encode.
- `0`–`9` jump between categories, `f` lists them all.
- `d` is the documentation for the highlighted tool: what it does, where it runs, every
  option, and a worked example taken from the tool itself.
- `enter` runs it. The example input is already loaded, so `enter enter` is a complete run;
  `e` edits the input first and `p` edits the options. An option the command line would
  refuse is refused here too.
- `y` copies whatever is on screen: the answer once a tool has run, including an error
  message, and otherwise the command that would produce it — `redbison json-format --indent 6`,
  ready to paste into a script. `o` opens the tool on redbison.dev, `x` turns on offline so a
  server-backed tool refuses rather than sends.
- `:` takes a tool id, a category, `offline`, `help` or `q`.
- `?` lists every key. `q` or `ctrl-c` leaves.

### The extras

Beside the hundred tools there is a drawer of things a terminal is good at: a clock and a
stopwatch in block digits, a coin that actually turns over, a random-number draw, a splitter
that deals names into even groups, and four games — snake, tetris, breakout and blocks (the
1010 kind: fit pieces, full rows and columns clear). They are the last rows of the picker's
list, under their own Extras category — `G` jumps to them, `/` finds them by name or alias,
and enter opens one like any tool. `:games` lists them too; each also answers to its own
command, `:snake`, `:clock`, `:random 1 100 3`, `:split 4`.

Each is a command outside the picker too. The screens need a live terminal:

```console
$ redbison snake
$ redbison stopwatch
```

while `coin`, `random` and `split` print plainly and compose like everything else:

```console
$ redbison coin
tails

$ redbison random 1 100 3
62
4
81

$ cut -d, -f1 people.csv | redbison split 4
Group 1: dee, flo
Group 2: bo, gus
Group 3: ann, cy
Group 4: ed, hal
```

Everything here runs on your machine; none of the extras ever touch the network.

### Finding a tool by what it does

The names are no help if you do not already know them, so `search` matches the same keywords
the search box on [redbison.dev](https://redbison.dev) matches:

```console
$ redbison search unix timestamp
epoch                   local   Convert timestamp

$ redbison search pretty print json
json-format             local   Format JSON

$ redbison search uuid v7
uuid                    local   Insert UUID
```

It reads initials too, so `redbison search b64` finds base64-encode and base64-decode. The
matches go to standard output in the same shape as `--list`, so they pipe; the count and the
hints go to standard error. `--json` gives the whole record of each match for a script, and the
exit code is `0` found, `1` nothing matched, `2` no query. Inside the picker, `/` runs the same
search.

### Your terminal's colours

The default palette is designed for a dark terminal. Set `REDBISON_THEME=terminal`, or pass
`--theme terminal`, and it uses the sixteen ANSI colours instead — which your terminal already
maps to the scheme you chose, so the picker comes out in Dracula, Gruvbox, Nord or Solarized
without configuring anything.

```sh
REDBISON_THEME=terminal redbison     # wear the shell's own scheme
REDBISON_THEME=default  redbison     # the designed palette, always
REDBISON_THEME=none     redbison     # no colour
```

A light background gets the terminal palette automatically when `COLORFGBG` reports one, because
a palette drawn against black is unreadable on cream. `NO_COLOR` is honoured whatever its value.

It only starts when both ends are a terminal, so a pipe, a script and CI all get the plain
behaviour they had before. `redbison --no-ui` or `REDBISON_NO_UI=1` turns it off for good.

### Credit

The picker's shape — the information block, the key hints, the counted title, the breadcrumbs,
the filter and command bars — is inspired by [k9s](https://k9scli.io) and the other open-source
terminal applications that showed what command line UX can be for developers. Its default
palette follows k9s's own default skin. Thank you to everyone who built them.

## Use

A tool takes its input from an argument, a file, or a pipe — whichever you give it.

```sh
redbison rot13 "hello"                 # an argument
redbison json-format --file data.json  # a file
cat data.json | redbison json-format   # a pipe
redbison json-format @data.json        # @path is shorthand for --file
```

The answer goes to standard output and nothing else does, so this works the way you would hope:

```sh
redbison hash --algorithm sha256 --file build.tar.gz | pbcopy
curl -s https://api.example.com/thing | redbison json-format > thing.json
```

### Finding a tool

```sh
redbison --help            # all 100, grouped
redbison --list            # one per line, for grep
redbison --list | grep -i base64
redbison base64-decode --help
```

Every tool's help page shows what it does, every option it takes with its values and default,
a worked example, and whether it uses the network:

```console
$ redbison hash --help
redbison hash: Hash the selection

MD5, SHA-1, SHA-256 and SHA-512 of the selection.

Usage:
  redbison hash [options] [text]
  cat file | redbison hash [options]
  redbison hash [options] --file path

Options:
  --algorithm <value>  digest algorithm; one of: sha256, sha512, sha384, sha1, md5; default "sha256"
                         sha256        the usual choice
                         sha1          broken for signatures, fine for checksums
                         md5           broken for signatures, fine for checksums
  --encoding <value>   how to print the digest; one of: hex, base64; default "hex"

Example:
  $ redbison hash --algorithm sha256 RedBison
  548590114f517e1198b39913e4bb9b0f0cde7ebafc76cf853b5b9597bb9bf902

Runs on your machine. No network.
Online: https://redbison.dev/hash-generator
```

### Options

Options are flags, and a wrong one is refused rather than ignored:

```console
$ redbison hash --algoritm sha512 abc
Unknown option --algoritm. hash takes --algorithm, --encoding. Did you mean --algorithm?
```

That matters more here than it looks: a digest produced with the wrong algorithm looks exactly
like one produced with the right algorithm.

A few options take a second body of text, and those accept a file too:

```sh
redbison list-compare --b @yesterday.txt --file today.txt
redbison hash-compare --b 900150983cd24fb0d6963f7d28e17f72 --file notes.md
```

If your input starts with a hyphen, put `--` first:

```sh
redbison number-to-words -- -42
```

## What runs where

89 of the 100 run entirely on your machine: JSON, base64, hashes, JWT decoding, case
conversion, sorting, hex, URLs, UUIDs, subnets, chmod, IEEE 754, YAML, SQL, HTML and XML
formatting, colours, cron checking, diffs, timezones and the rest. They are arithmetic and
string work, and your input never leaves the process.

The other 11 each need a library too large to bundle, or a data set that changes without us:

| Tool | What it needs |
| --- | --- |
| `js-beautify`, `css-beautify` | a real JavaScript and CSS printer |
| `json-schema-validate` | a JSON Schema engine |
| `toml-convert` | a TOML parser |
| `bcrypt-hash`, `bcrypt-verify` | bcrypt |
| `password-strength` | a password dictionary |
| `ascii-art` | the figlet font set |
| `cron-build` | a cron expander with real calendars |
| `docker-to-compose` | the Docker argument surface |
| `user-agent` | a user-agent table that changes weekly |

Those eleven send the input to `mcp.redbison.dev` and send nothing else: no account, no
identifier, nothing stored.

To be certain, pass `--offline`. It refuses rather than sending:

```console
$ redbison js-beautify --offline "var a=1"
js-beautify runs on the server, and --offline was given, so nothing was sent.
Tools that work without a network: redbison --list | grep local
```

```sh
redbison --list | grep local | wc -l   # 89
```

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | it worked |
| `1` | the tool refused the input, or the server could not be reached |
| `2` | the command line was wrong: unknown tool, unknown option, missing input |

Diagnostics go to standard error, so a pipe only ever carries the answer.

```sh
redbison json-validate --file config.json || echo "config.json is not valid JSON"
```

## Recipes

```sh
# Pretty-print every JSON file in a directory, in place
for f in *.json; do redbison json-format --file "$f" > "$f.tmp" && mv "$f.tmp" "$f"; done

# What is in this JWT?
redbison jwt-decode "$TOKEN"

# A password for a new service
redbison password --length 32 --charset alphanumeric

# Sort an import list the way a human would
redbison sort-lines --order natural --file imports.txt

# Which of yesterday's URLs are gone today?
redbison list-compare --b @today.txt --file yesterday.txt

# Checksum a release and copy it
redbison hash --algorithm sha512 --file release.tar.gz | pbcopy
```

## Everything else

- The tools online: [redbison.dev](https://redbison.dev)
- In your editor: [redbison.dev/plugins](https://redbison.dev/plugins)
- For AI assistants over MCP: [redbison.dev/ai](https://redbison.dev/ai)
- Source: [github.com/redbison-dev/redbison-tools](https://github.com/redbison-dev/redbison-tools)

MIT licensed.
