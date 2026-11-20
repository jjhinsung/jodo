"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

type Task = {
  id: string;
  action: string;
  priority: number; // 1-5
  time: string; // A-E
  allotment: string; // minutes, free text/number
};

const PRIORITIES = [1, 2, 3, 4, 5];
const TIME_LETTERS = ["A", "B", "C", "D", "E"];

export default function Plan() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const [action, setAction] = useState("");
  const [priority, setPriority] = useState<number | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [allotment, setAllotment] = useState("");

  // Load tasks from localStorage on first render
  useEffect(() => {
    const saved = localStorage.getItem("jodo-tasks");
    if (saved) {
      try {
        setTasks(JSON.parse(saved));
      } catch {
        setTasks([]);
      }
    }
  }, []);

  // Persist tasks to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("jodo-tasks", JSON.stringify(tasks));
  }, [tasks]);

  function resetForm() {
    setAction("");
    setPriority(null);
    setTime(null);
    setAllotment("");
  }

  function handleDone() {
    if (!action.trim()) return; // require at least an action name

    const newTask: Task = {
      id: crypto.randomUUID(),
      action: action.trim(),
      priority: priority ?? 5,
      time: time ?? "A",
      allotment: allotment.trim(),
    };

    setTasks((prev) => [...prev, newTask]);
    resetForm();
    setIsOpen(false);
  }

  function handleDelete(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function handleClose() {
    resetForm();
    setIsOpen(false);
  }

  return (
    <div className={`${inter.className} min-h-screen bg-neutral-800 text-neutral-100 relative`}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 sm:px-10 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Plan</h1>

        <Link
          href="/"
          className="flex items-center justify-center w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-700 shadow-sm hover:bg-neutral-700 transition-colors"
        >
          <span className="text-lg font-bold tracking-tight text-neutral-100">JT</span>
        </Link>
      </div>

      {/* Task list */}
      <main className="px-6 sm:px-10 max-w-2xl mx-auto">
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center justify-between bg-neutral-900 border border-neutral-700 rounded-lg px-5 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 shrink-0" />
                <span className="font-medium">{task.action}</span>
                <span className="text-sm text-neutral-400">
                  P{task.priority} · {task.time}
                </span>
              </div>

              <button
                type="button"
                aria-label={`Delete ${task.action}`}
                onClick={() => handleDelete(task.id)}
                className="text-neutral-500 hover:text-red-400 transition-colors text-lg leading-none px-2"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </main>

      {/* Add task button — bottom right */}
      <button
        type="button"
        aria-label="Add task"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 right-8 flex items-center justify-center w-14 h-14 rounded-full border-2 border-neutral-500 bg-neutral-800 text-neutral-100 text-2xl font-light hover:bg-neutral-700 hover:border-neutral-300 transition-colors"
      >
        +
      </button>

      {/* ===== Modal ===== */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={handleClose}
          />

          {/* Modal panel */}
          <div className="relative bg-neutral-900 border border-neutral-700 rounded-2xl w-[90vw] max-w-md aspect-square p-6 flex flex-col">
            {/* Close button */}
            <button
              type="button"
              aria-label="Close"
              onClick={handleClose}
              className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-100 text-xl leading-none transition-colors"
            >
              ×
            </button>

            <div className="flex-1 flex flex-col justify-center gap-5 overflow-y-auto">
              {/* Action */}
              <div>
                <label className="block text-sm font-semibold text-neutral-400 mb-1.5">
                  Action
                </label>
                <input
                  type="text"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  placeholder="What do you need to do?"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-semibold text-neutral-400 mb-1.5">
                  Priority
                </label>
                <div className="flex gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`w-9 h-9 rounded-lg text-sm font-semibold border transition-colors ${
                        priority === p
                          ? "bg-neutral-100 text-neutral-900 border-neutral-100"
                          : "bg-neutral-800 text-neutral-300 border-neutral-700 hover:border-neutral-500"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time */}
              <div>
                <label className="block text-sm font-semibold text-neutral-400 mb-1.5">
                  Time
                </label>
                <div className="flex gap-2">
                  {TIME_LETTERS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTime(t)}
                      className={`w-9 h-9 rounded-lg text-sm font-semibold border transition-colors ${
                        time === t
                          ? "bg-neutral-100 text-neutral-900 border-neutral-100"
                          : "bg-neutral-800 text-neutral-300 border-neutral-700 hover:border-neutral-500"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time allotment */}
              <div>
                <label className="block text-sm font-semibold text-neutral-400 mb-1.5">
                  Time allotment (minutes)
                </label>
                <input
                  type="number"
                  min={0}
                  value={allotment}
                  onChange={(e) => setAllotment(e.target.value)}
                  placeholder="e.g. 25"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400"
                />
              </div>
            </div>

            {/* Done button */}
            <button
              type="button"
              onClick={handleDone}
              className="mt-5 w-full py-2.5 rounded-lg bg-neutral-100 text-neutral-900 font-semibold text-sm hover:bg-white transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}