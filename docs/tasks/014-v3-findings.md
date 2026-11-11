# Task 014 - Fixes from the v3 walkthrough recording

1. Picking a location does not refresh the sun study: after choosing a
   city the sun strip keeps the old sunrise/sunset range, solar noon and
   sun angle, and (in a frame-stepped capture) the shadows do not change
   until the time is moved. Location, time zone and orientation changes
   must update the strip, the slider range (keeping the same clock time
   where it is still daylight, otherwise clamping) and the shadows
   immediately. Add an e2e check.
2. Expensive redraw: a running animation (the assistant's working
   indicator) or a blinking caret over frosted-glass panels makes every
   frame very costly on software GL (measured screenshot time 3.5-5.7 s
   versus ~0.1-0.2 s with backdrop-filter disabled or the animation
   paused). Remove backdrop-filter from every surface that can sit over
   the canvas (use near-opaque surfaces) and keep indicator animations
   cheap (transform/opacity only, small area). Re-measure with the same
   states and report the numbers; the look must stay calm and designed.
3. Opening a template from the menu inherits the previous view state
   (cutaway level, sun on, camera). A newly opened house starts whole, in
   presentation lighting, at the default view, with the location prompt
   placed so it does not cover the house.
4. The 视角 popover opens over the middle of the house. Make it a compact
   strip/popover that leaves the house visible (consistent with 楼层 and
   日照), at all viewports.
5. The working indicator says "正在修改房子" while the summary is already
   streaming: its text follows the actual phase (thinking / editing /
   writing) and it disappears when the reply completes.
6. First-visit hint chips linger: dismiss them after the first meaningful
   interaction of any kind (not only when one is used or closed), and do
   not show the 走进去 hint right above the 走进去 button (make the hints
   distinct from the buttons, or attach each hint to its button).
7. Eye-level presets: when a tree hides the centre of the facade from the
   default side, use the other side (the sheet code already does this).
   Phone 3D framing: the house is centred, not tight to the left edge.
8. Undo survives a reload: persist the undo/redo history (bounded) with
   the autosave so the changes card still offers undo after reloading.
9. The four secondary buttons (视角 / 楼层 / 日照 / 走进去) read a little
   larger and clearer on desktop; the prompt bar remains the primary
   control.
10. Test data: make the suggestion chips and the stub's scripted answers
    agree for T1.

Acceptance: clean checkout build, typecheck, tests, shots and chat e2e
pass; control-count check still passes; golden-sample render shots
unchanged within noise; before/after screenshots for each item at
1440x900 and 390x844.
