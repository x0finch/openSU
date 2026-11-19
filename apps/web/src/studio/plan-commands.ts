// What the toolbar asks of the plan view (zoom, fit): set by PlanView while it is shown (task 033: its own module, so
// the toolbar does not bring the plan view into the first paint).
export const planCommands: { zoom: (factor: number) => void; fit: () => void } = { zoom: () => {}, fit: () => {} };
