import { useReducer, useRef, useState } from "preact/hooks";
import { Tile } from "./Tile";
import { suggestWord } from "../../../suggest-word.mjs";
import words from "../../../words.json";

function pad(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatLocalDateForApi(d = new Date()) {
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${year}-${month}-${day}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function computeFeedback(guess, solution) {
  const result = Array(5).fill("absent");
  const solutionLetters = solution.split("");

  // mark correct
  for (let i = 0; i < 5; i++) {
    if (guess[i] === solutionLetters[i]) {
      result[i] = "correct";
      solutionLetters[i] = null;
    }
  }

  // mark present
  for (let i = 0; i < 5; i++) {
    if (result[i] !== "correct") {
      const foundIndex = solutionLetters.indexOf(guess[i]);
      if (foundIndex !== -1) {
        result[i] = "present";
        solutionLetters[foundIndex] = null;
      }
    }
  }

  return result;
}

const initialState = {
  attempts: [],
  running: false,
  message: "",
  keyStatus: new Map(),
};

function reducer(state, action) {
  switch (action.type) {
    case "RESET":
      return { ...initialState };
    case "START":
      return { ...state, running: true, message: action.message || "" };
    case "STOP":
      return { ...state, running: false };
    case "SET_MESSAGE":
      return { ...state, message: action.message };
    case "ADD_ATTEMPT":
      return { ...state, attempts: [...state.attempts, action.attempt] };
    case "REVEAL_TILE": {
      const attemptsCopy = state.attempts.slice();
      const attempt = { ...attemptsCopy[action.row] };
      const statuses = attempt.statuses.slice();
      statuses[action.index] = action.status;
      attempt.statuses = statuses;
      attemptsCopy[action.row] = attempt;
      return { ...state, attempts: attemptsCopy };
    }
    case "UPDATE_KEY": {
      const nextMap = new Map(state.keyStatus);
      const prev = nextMap.get(action.letter);
      if (prev === "correct") return state;
      if (prev === "present" && action.status === "absent") return state;
      nextMap.set(action.letter, action.status);
      return { ...state, keyStatus: nextMap };
    }
    default:
      return state;
  }
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const runIdRef = useRef(0);
  const [startWord, setStartWord] = useState("trace");

  const normalizedStart = (startWord || "").toLowerCase();
  const isStartWordValid =
    normalizedStart.length === 5 && words.includes(normalizedStart);
  const startInvalid = normalizedStart.length === 0 || !isStartWordValid;
  // true when the start word should prevent submission (not 5 letters or not in list)
  const startSubmitInvalid = normalizedStart.length !== 5 || !isStartWordValid;

  function reset() {
    // invalidate any running solver
    runIdRef.current++;
    dispatch({ type: "RESET" });
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (state.running) return;
    if (startSubmitInvalid) {
      dispatch({ type: "SET_MESSAGE", message: "Invalid starting word" });
      return;
    }
    solve();
  }

  async function solve() {
    if (state.running) return;
    const myRunId = ++runIdRef.current;
    dispatch({ type: "RESET" });
    dispatch({ type: "START", message: "Fetching today's solution..." });

    const date = formatLocalDateForApi(new Date());
    let solution;

    try {
      const res = await fetch(`/api/${date}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      solution = (data.solution || "").toLowerCase();
      if (solution.length !== 5) throw new Error("invalid solution");
    } catch (err) {
      dispatch({ type: "SET_MESSAGE", message: "Failed: " + err.message });
      dispatch({ type: "STOP" });
      return;
    }

    // If a reset happened during fetch, abort this run
    if (runIdRef.current !== myRunId) {
      dispatch({ type: "SET_MESSAGE", message: "Aborted" });
      dispatch({ type: "STOP" });
      return;
    }

    dispatch({ type: "SET_MESSAGE", message: "Solving..." });

    const absent = [];
    const correct = new Map();
    const present = new Map();
    const bannedWords = [];

    let guess = (startWord || "trace").toLowerCase();
    if (guess.length !== 5) {
      dispatch({
        type: "SET_MESSAGE",
        message: "Starting word must be 5 letters",
      });
      dispatch({ type: "STOP" });
      return;
    }

    if (!words.includes(guess)) {
      dispatch({
        type: "SET_MESSAGE",
        message: "Starting word is not in the word list",
      });
      dispatch({ type: "STOP" });
      return;
    }

    for (let turn = 0; turn < 6; turn++) {
      if (runIdRef.current !== myRunId) break;

      if (turn > 0) {
        const suggestion = suggestWord(absent, correct, present, bannedWords);
        if (!suggestion) {
          dispatch({ type: "SET_MESSAGE", message: "No suggestions left" });
          break;
        }
        guess = suggestion;
      }

      dispatch({
        type: "ADD_ATTEMPT",
        attempt: { word: guess, statuses: Array(5).fill(null) },
      });

      const feedback = computeFeedback(guess, solution);

      for (let i = 0; i < 5; i++) {
        if (runIdRef.current !== myRunId) break;
        await sleep(350);
        dispatch({
          type: "REVEAL_TILE",
          row: turn,
          index: i,
          status: feedback[i],
        });
        dispatch({ type: "UPDATE_KEY", letter: guess[i], status: feedback[i] });
      }

      bannedWords.push(guess);

      for (let i = 0; i < 5; i++) {
        const letter = guess[i];
        const status = feedback[i];
        if (status === "correct") {
          correct.set(letter, [...(correct.get(letter) || []), i]);
        } else if (status === "present") {
          present.set(letter, [...(present.get(letter) || []), i]);
        } else if (status === "absent") {
          if (
            !correct.has(letter) &&
            !present.has(letter) &&
            !absent.includes(letter)
          )
            absent.push(letter);
        }
      }

      if (guess === solution) {
        dispatch({
          type: "SET_MESSAGE",
          message: `Solved in ${turn + 1} attempts!`,
        });
        dispatch({ type: "STOP" });
        return;
      }

      await sleep(300);
    }

    if (runIdRef.current !== myRunId)
      dispatch({ type: "SET_MESSAGE", message: "Aborted" });
    else
      dispatch({
        type: "SET_MESSAGE",
        message: "Failed to solve within 6 attempts.",
      });
    dispatch({ type: "STOP" });
  }

  function renderRow(rowIndex) {
    const attempt = state.attempts[rowIndex] || { word: "", statuses: [] };
    return (
      <div className="flex justify-center my-1" key={rowIndex}>
        {Array.from({ length: 5 }).map((_, cellIndex) => (
          <div className="p-0.5 sm:p-1" key={cellIndex}>
            <Tile
              letter={(attempt.word || "")[cellIndex] || ""}
              status={attempt.statuses[cellIndex] || ""}
              reveal={Boolean(attempt.statuses[cellIndex])}
            />
          </div>
        ))}
      </div>
    );
  }

  const keyboardRows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

  return (
    <div className="min-h-screen flex items-start justify-center bg-transparent p-4 sm:p-6">
      <div className="w-full max-w-md">
        <h1 className="site-title mb-2 text-2xl sm:text-3xl">Wordle Buddy</h1>

        <p className="text-sm text-gray-200 mb-2 max-w-[28rem]">
          A bot that automatically attempts to solve{" "}
          <a
            className="underline decoration-amber-300 text-amber-300 font-medium"
            href="https://www.nytimes.com/games/wordle/index.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            wordle
          </a>
          .
          <a
            className="ml-2 text-sm text-amber-300 underline"
            href="https://www.robin-drexler.com/projects#-wordle-buddy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn more
          </a>
          <br />
          Can you beat it?
        </p>

        {/* Starting word input */}
        <form onSubmit={handleSubmit}>
          <div className="mt-3 mb-4">
            <label className="block text-sm text-gray-200 mb-1">
              Starting word:
            </label>
            <div className="flex gap-2 items-center">
              <input
                aria-label="Starting word"
                maxLength={5}
                value={typeof startWord === "undefined" ? "trace" : startWord}
                onInput={(e) => {
                  const v = e.target.value
                    .replace(/[^a-zA-Z]/g, "")
                    .toLowerCase();
                  setStartWord(v);
                }}
                className={`w-[7ch] sm:w-[8ch] px-2 py-1 rounded-md bg-white/6 border border-white/12 text-gray-200 text-center font-semibold focus:outline-none focus:ring-2 focus:ring-white/10 ${
                  startInvalid ? "ring-2 ring-rose-500/60" : ""
                }`}
              />
              {normalizedStart.length > 0 && normalizedStart.length !== 5 && (
                <div
                  id="start-error"
                  className="text-rose-400 text-xs mt-1"
                  aria-live="polite"
                >
                  Must be 5 letters
                </div>
              )}
              {normalizedStart.length === 5 && !isStartWordValid && (
                <div
                  id="start-error"
                  className="text-rose-400 text-xs mt-1"
                  aria-live="polite"
                >
                  Not in word list
                </div>
              )}
              <div className="text-sm text-gray-400">
                Use a valid 5-letter word
              </div>
            </div>
          </div>

          <div className="bg-white/10 border border-white/10 rounded-2xl p-4 sm:p-6 mb-6 text-gray-200">
            <div className="mx-auto max-w-[20rem]">
              <div className="grid grid-rows-6">
                {[0, 1, 2, 3, 4, 5].map((i) => renderRow(i))}
              </div>

              <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-center">
                <button
                  type="submit"
                  className={`w-full sm:w-auto h-10 flex items-center justify-center px-4 rounded-md font-semibold bg-amber-300 text-gray-900 border border-black/10 focus:outline-none focus:ring-2 focus:ring-white/10 disabled:opacity-60 disabled:cursor-not-allowed ${
                    state.running || startSubmitInvalid
                      ? "opacity-60 cursor-not-allowed"
                      : "hover:-translate-y-0.5 transform transition"
                  }`}
                  disabled={state.running || startSubmitInvalid}
                  aria-disabled={
                    state.running || startSubmitInvalid ? "true" : "false"
                  }
                  aria-describedby={
                    startSubmitInvalid ? "start-error" : undefined
                  }
                >
                  Solve Today's Wordle
                </button>

                <button
                  type="button"
                  className="w-full sm:w-auto h-10 flex items-center justify-center px-4 rounded-md bg-white/6 text-gray-200 border border-white/12 hover:bg-white/9 focus:outline-none focus:ring-2 focus:ring-white/10"
                  onClick={reset}
                >
                  Reset
                </button>
              </div>

              {state.message &&
                (() => {
                  const msg = state.message || "";
                  const getVariant = (m) => {
                    if (!m) return "hidden";
                    if (m.startsWith("Solved")) return "success";
                    if (m.includes("Failed") || m.includes("No suggestions"))
                      return "error";
                    if (m.includes("Aborted")) return "warning";
                    return "info";
                  };

                  const variant = getVariant(msg);
                  const variantClass =
                    variant === "success"
                      ? "bg-emerald-700/90 text-white shadow-sm"
                      : variant === "error"
                      ? "bg-rose-600/90 text-white shadow-sm"
                      : variant === "warning"
                      ? "bg-amber-500/90 text-black shadow-sm"
                      : "bg-white/6 text-gray-200 border border-white/12";

                  const icon =
                    variant === "success"
                      ? "✅"
                      : variant === "error"
                      ? "❌"
                      : variant === "warning"
                      ? "⚠️"
                      : "ℹ️";

                  return (
                    <div
                      className="flex justify-center mt-4 mb-4"
                      role="status"
                      aria-live="polite"
                    >
                      <div
                        key={msg}
                        className={`w-full max-w-[20rem] text-center text-sm px-3 py-2 rounded-md ${variantClass} transition-opacity duration-200 inline-flex items-center justify-center gap-2`}
                      >
                        <span className="text-base">{icon}</span>
                        <span className="truncate">{msg}</span>
                      </div>
                    </div>
                  );
                })()}

              <div className={state.message ? "mt-0" : "mt-4"}>
                {keyboardRows.map((row, rowIndex) => (
                  <div
                    key={rowIndex}
                    className={`flex justify-center gap-1 mb-1`}
                  >
                    {row.split("").map((keyChar) => {
                      const keyState = state.keyStatus.get(keyChar) || "";
                      const base =
                        "min-w-[1.4rem] sm:min-w-[1.8rem] h-6 sm:h-8 inline-flex items-center justify-center rounded text-xs sm:text-sm font-semibold px-1 sm:px-2";
                      const cls =
                        keyState === "correct"
                          ? `${base} bg-[#6aaa64] text-white`
                          : keyState === "present"
                          ? `${base} bg-[#c9b458] text-white`
                          : keyState === "absent"
                          ? `${base} bg-[#525558] text-white`
                          : `${base} bg-white/6 text-gray-200 border border-white/12 hover:bg-white/9`;
                      return (
                        <div key={keyChar} className={cls}>
                          {keyChar.toUpperCase()}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </form>

        <footer
          role="contentinfo"
          className="mt-6 text-white/70 text-sm text-center"
        >
          <p>
            Made with <span aria-hidden>❤️</span> by{" "}
            <a
              href="https://www.robin-drexler.com"
              className="text-[#e9d5ff] underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Robin Drexler
            </a>
          </p>
          <p className="mt-1">
            <a
              href="https://github.com/robin-drexler/wordle-buddy"
              className="text-[#e9d5ff] underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Source
            </a>{" "}
            on GitHub
          </p>
        </footer>
      </div>
    </div>
  );
}
