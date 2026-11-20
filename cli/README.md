# redbison

The [redbison.dev](https://redbison.dev) tools in your terminal. 100 developer utilities, 65 of
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

65 of the 100 run entirely on your machine: JSON, base64, hashes, JWT decoding, case
conversion, sorting, hex, URLs, UUIDs, subnets, chmod, IEEE 754 and the rest. They are
arithmetic and string work, and your input never leaves the process.

The other 35 need a real parser or a data set that changes without us — YAML, SQL, HTML, XML,
JavaScript and CSS formatting, bcrypt, ASCII-art fonts, schema validation, user-agent tables —
so they send the input to `mcp.redbison.dev` and send nothing else: no account, no identifier,
nothing stored.

To be certain, pass `--offline`. It refuses rather than sending:

```console
$ redbison yaml-to-json --offline "a: 1"
yaml-to-json runs on the server, and --offline was given, so nothing was sent.
Tools that work without a network: redbison --list | grep local
```

```sh
redbison --list | grep local | wc -l   # 65
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
