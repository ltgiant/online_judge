import type { Step } from "react-joyride";

export const problemTourSteps: Step[] = [
  {
    target: "[data-tour='problem-title']",
    content: "Check the problem title and difficulty.",
    disableBeacon: true,
  },
  {
    target: "[data-tour='problem-tabs']",
    content: "Use these tabs to switch between statement, run, and submit.",
  },
  {
    target: "[data-tour='problem-statement']",
    content: "Read the statement and constraints here.",
  },
  {
    target: "[data-tour='public-samples']",
    content: "Review sample inputs and expected outputs.",
  },
  {
    target: "[data-tour='editor']",
    content: "Write your solution in the editor.",
  },
  {
    target: "[data-tour='run-input']",
    content: "Provide input for quick runs (JSON payload or stdin).",
  },
  {
    target: "[data-tour='run-btn']",
    content: "Run your code without grading.",
  },
  {
    target: "[data-tour='submit-btn']",
    content: "Submit when you are ready.",
  },
];
