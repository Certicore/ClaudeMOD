# ClaudeMOD

Claude Code mods by NyxStudio: plugins whose hooks module changes how Claude Code looks and behaves. This repository is also a plugin marketplace, `nyxstudio-mods`.

| Mod | What it does |
| --- | --- |
| [`progress`](progress/) | An animated progress band above the prompt: one row per plan Claude reports (an LED-matrix bar, a chip naming the stage, the percentage, a ✕ that dissolves the row), the 5h and 7d plan limits under it, and a limit you drag into place that pauses the work when it is reached. |

![progress](progress/screenshots/desktop-band.gif)

## Install

Requires Claude Code 2.1.287 or later, signed in.

```sh
claude plugin marketplace add Certicore/ClaudeMOD
claude plugin install progress@nyxstudio-mods
```

Or from a Claude Code session:

```text
/plugin install progress --marketplace Certicore/ClaudeMOD
```

Then start a new session, or run `/reload-plugins` in an open one. Update later with `claude plugin update progress@nyxstudio-mods`.

To try it without installing, clone the repository and load the folder for one session:

```sh
git clone https://github.com/Certicore/ClaudeMOD.git
claude --plugin-dir ./ClaudeMOD/progress
```

A mod runs with your permissions inside Claude Code. Before installing, you can list what this one hooks and calls with `claude plugin validate ./ClaudeMOD/progress`.

## License

MIT
