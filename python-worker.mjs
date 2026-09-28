import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";

const PYODIDE_INDEX = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
let pyodidePromise;
let pythonGlobals;

async function getPython() {
    if (!pyodidePromise) {
        self.postMessage({ type: "status", status: "loading" });
        pyodidePromise = loadPyodide({ indexURL: PYODIDE_INDEX }).then((pyodide) => {
            pythonGlobals = pyodide.globals.get("dict")();
            self.postMessage({ type: "status", status: "ready" });
            return pyodide;
        });
    }

    return pyodidePromise;
}

self.addEventListener("message", async (event) => {
    if (event.data?.type !== "run") return;

    const { code, runId } = event.data;

    try {
        const pyodide = await getPython();
        pythonGlobals.set("__pixydelta_code", code);
        self.postMessage({ type: "status", status: "running", runId });

        const captured = await pyodide.runPythonAsync(`
import contextlib
import io
import traceback

__pixydelta_stdout = io.StringIO()
__pixydelta_stderr = io.StringIO()

try:
    with contextlib.redirect_stdout(__pixydelta_stdout), contextlib.redirect_stderr(__pixydelta_stderr):
        exec(compile(__pixydelta_code, "student_code.py", "exec"), globals())
except BaseException:
    traceback.print_exc(file=__pixydelta_stderr)

(__pixydelta_stdout.getvalue(), __pixydelta_stderr.getvalue())
        `, { globals: pythonGlobals });

        const [stdout, stderr] = captured.toJs();
        captured.destroy();
        self.postMessage({ type: "result", runId, stdout, stderr });
    } catch (error) {
        self.postMessage({
            type: "result",
            runId,
            stdout: "",
            stderr: error?.message || String(error)
        });
    }
});
