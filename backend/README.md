# ARKlight backend (stage 2 — minimal)

A deliberately small Flask service that exposes a real directory on
disk to the browser workbench via REST. This is the thing
`workbench.web.main.ts`'s `FileSystemProvider` should be pointed at
instead of the built-in IndexedDB/local-file providers.

Not included, on purpose: authentication, terminals, a compiler,
Docker, workspace management. Those are separate concerns — bolt
them on independently once this contract is solid.

## Quick start

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
WORKSPACE_ROOT=/path/to/your/project python app.py
```

Server listens on `:5000` by default (override with `PORT`).

## API

| Method | Path                        | Purpose                          |
|--------|-----------------------------|-----------------------------------|
| GET    | `/workspace/files`          | Recursive file/dir listing        |
| GET    | `/workspace/file/<path>`    | Read file content                 |
| PUT    | `/workspace/file/<path>`    | Write file content                |
| POST   | `/workspace/file/<path>`    | Create empty file                 |
| DELETE | `/workspace/file/<path>`    | Delete file                       |
| POST   | `/workspace/dir/<path>`     | Create directory                  |
| GET    | `/healthz`                  | Liveness + resolved workspace root|

All paths are relative to `WORKSPACE_ROOT` and are resolved+checked
to prevent `../` escaping the workspace directory.

## Next steps (not yet built here)

- Wire a custom `FileSystemProvider` in the workbench source
  (`src/vs/platform/files/...`) that calls these endpoints instead of
  the default local file service.
- Point `workspaceProvider` at `arklight:/project` per `AUTOMATION.md`.
- Add auth once there's more than one user hitting this.
- Consider websockets for live file-change notifications instead of
  polling, once the read/write path is proven.
