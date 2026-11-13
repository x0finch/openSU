# Third-party notices

openSU is licensed under AGPL-3.0 (see `LICENSE`). Parts of it are adapted
from the following MIT-licensed projects.

## glasswork

https://github.com/kubai087/glasswork

Adapted (code, not only numbers):
- `apps/web/src/glass/glass.css`: the CSS backend's material (the tint as a
  `color-mix`, the `blur() saturate() brightness()` backdrop filter, and the
  box-shadow list for the rim light, bevel, hairline and shadow), from
  glasswork's `src/glass.css`.
- `packages/render/src/glass.ts`: the material values and the rim light,
  bevel and shadow terms of the composite shader follow glasswork's
  `glass.css`, `lens.js` and `refract.js` (by way of the prototype in
  `docs/prototypes/liquid-glass.html`).

glasswork's wallpapers (`media/`) are not used and not covered by its
license (see its NOTICE).

```
MIT License

Copyright (c) 2026 Kubai087

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## glisse

https://github.com/0kzh/glisse (npm package `glisse`)

Adapted: the press interaction in `apps/web/src/glass/Glass.tsx`
(`usePress`: growth by a few pixels, rubber-band stretch towards a drag,
a light that follows the pointer) and the lifted-lens behaviour of the
segmented control and slider in `apps/web/src/glass/primitives.tsx`
(lens growth in pixels, lifted while pressed or dragged, a magnified copy
of the labels inside the lens), from glisse's `press`, `TabBar` /
`SegmentedControl` and `Slider`.

```
MIT License

Copyright (c) 2026 Kelvin Zhang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
