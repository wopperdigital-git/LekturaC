import type { Card, ContentBlock, LayoutType } from '@/engine/contentBlocks'

/**
 * Development only. A photo that needs no network: a 1200x800 SVG with a soft
 * two-colour gradient and a few shapes, inlined as a data URI. Used by the
 * gallery deck so every photo slide draws offline.
 */
const PHOTO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#8fb8c9"/><stop offset="1" stop-color="#e3c9a8"/>' +
  '</linearGradient></defs>' +
  '<rect width="1200" height="800" fill="url(#g)"/>' +
  '<circle cx="900" cy="230" r="120" fill="#ffffff" fill-opacity="0.45"/>' +
  '<path d="M0 640 L260 420 L470 590 L720 360 L1000 600 L1200 480 L1200 800 L0 800 Z" fill="#3f5d6b" fill-opacity="0.55"/>' +
  '<path d="M0 720 L300 560 L560 700 L820 540 L1200 720 L1200 800 L0 800 Z" fill="#26404c" fill-opacity="0.6"/>' +
  '</svg>'

export const FIXTURE_PHOTO = `data:image/svg+xml;utf8,${encodeURIComponent(PHOTO_SVG)}`

const heading = (text: string): ContentBlock => ({ type: 'heading', text })
const paragraph = (text: string): ContentBlock => ({ type: 'paragraph', text })
const list = (...items: string[]): ContentBlock => ({ type: 'bulletList', items })
const stat = (value: string, label: string): ContentBlock => ({ type: 'stat', value, label })
const step = (label: string, text: string): ContentBlock => ({ type: 'timelineStep', label, text })
const group = (name: string, ...items: string[]): ContentBlock => ({
  type: 'comparisonGroup',
  heading: name,
  items,
})
const photo = (alt: string): ContentBlock => ({ type: 'image', url: FIXTURE_PHOTO, alt })

type Spec = [id: string, layout: LayoutType, blocks: ContentBlock[]]

const SPECS: Spec[] = [
  [
    'g-hero',
    'hero',
    [heading('Control Structures in C++'), paragraph('How a program decides what to do next.')],
  ],
  [
    'g-icons3',
    'iconGrid',
    [
      heading('Three ways to choose'),
      paragraph('Pick the form that matches the decision.'),
      list('if and else', 'switch', 'ternary'),
    ],
  ],
  [
    'g-icons6',
    'iconGrid',
    [
      heading('Six keywords to know'),
      list('if', 'else', 'switch', 'case', 'break', 'default'),
    ],
  ],
  [
    'g-numbered',
    'numberedList',
    [
      heading('Reading a loop'),
      paragraph('Trace one pass at a time.'),
      list(
        'Find the starting value of the counter.',
        'Check the condition before the body runs.',
        'Run the body once with the current value.',
        'Apply the update expression to the counter.',
        'Return to the check and stop when it fails.',
      ),
    ],
  ],
  [
    'g-numbered10',
    'numberedList',
    [
      heading('Ten rules for tidy loops'),
      list(
        'Name the counter',
        'Keep the body short',
        'Prefer range for',
        'Avoid magic numbers',
        'Declare the counter in the header',
        'Do not edit the counter inside',
        'Use break sparingly',
        'Use continue sparingly',
        'Guard against off by one',
        'Test the empty case',
      ),
    ],
  ],
  [
    'g-checklist',
    'checklist',
    [
      heading('Before you ship a loop'),
      list(
        'It stops for every input',
        'The counter has the right type',
        'The last element is included',
        'An empty range does nothing',
      ),
    ],
  ],
  [
    'g-split',
    'splitList',
    [
      heading('Where each form fits'),
      list(
        'if for one choice',
        'else if for a few',
        'switch for many values',
        'ternary for a value',
        'for for a known count',
        'while for an unknown count',
        'do while for at least once',
        'range for for containers',
      ),
    ],
  ],
  [
    'g-stats3',
    'statGrid',
    [
      heading('Loops in numbers'),
      stat('3', 'loop forms'),
      stat('1', 'condition per loop'),
      stat('0', 'tolerance for infinite loops'),
    ],
  ],
  [
    'g-stats5',
    'statGrid',
    [
      heading('The language at scale'),
      stat('40+', 'years in use'),
      stat('6', 'standards since 1998'),
      stat('1,250,000', 'lines in a large code base'),
      stat('4', 'major compilers'),
      stat('99%', 'of loops end'),
    ],
  ],
  [
    'g-statlist',
    'statList',
    [
      heading('What a compiler checks'),
      paragraph('Each check catches a class of mistakes before the program runs.'),
      stat('1', 'Every name is declared before it is used'),
      stat('2', 'Every call matches a function signature'),
      stat('3', 'Every branch returns the promised type'),
      stat('4', 'Every constant stays constant'),
    ],
  ],
  [
    'g-stathero',
    'statHero',
    [
      heading('One number to remember'),
      stat('100%', 'of loops need an exit'),
      paragraph('Every loop must have a way to end, or the program never finishes.'),
    ],
  ],
  [
    'g-timeline',
    'timeline',
    [
      heading('How a loop runs'),
      paragraph('Every pass follows the same steps.'),
      step('Start', 'Set the counter.'),
      step('Check', 'Test the condition.'),
      step('Run', 'Do the body once.'),
      step('Step', 'Update the counter.'),
    ],
  ],
  [
    'g-timelinerow',
    'timelineRow',
    [
      heading('From source to program'),
      step('Write', 'Type the code.'),
      step('Compile', 'Turn it into object files.'),
      step('Link', 'Join the object files.'),
      step('Run', 'Start the program.'),
    ],
  ],
  [
    'g-timelinerow6',
    'timelineRow',
    [
      heading('A week of C++ practice'),
      step('Mon', 'Variables and types.'),
      step('Tue', 'Branches.'),
      step('Wed', 'Loops.'),
      step('Thu', 'Functions.'),
      step('Fri', 'Arrays.'),
      step('Sat', 'A small project.'),
    ],
  ],
  [
    'g-compare',
    'comparison',
    [
      heading('for versus while'),
      group('for', 'Known count', 'Counter in the header', 'Compact'),
      group('while', 'Unknown count', 'Condition only', 'Flexible'),
    ],
  ],
  [
    'g-compare3',
    'comparison',
    [
      heading('Three ways to repeat'),
      group('for', 'Known count', 'Counter in the header', 'Compact'),
      group('while', 'Unknown count', 'Condition only', 'Flexible'),
      group('do while', 'Runs at least once', 'Condition at the end', 'Menus and retries'),
    ],
  ],
  [
    'g-table',
    'comparisonTable',
    [
      heading('Choosing a container'),
      group('vector', 'Contiguous memory', 'Fast index access', 'Slow insert in the middle', 'The default choice'),
      group('list', 'Linked nodes', 'No index access', 'Fast insert anywhere', 'Rarely the best fit'),
      group('map', 'Sorted keys', 'Lookup by key', 'Logarithmic time', 'Good for dictionaries'),
    ],
  ],
  [
    'g-quote',
    'quote',
    [
      heading('A rule worth keeping'),
      { type: 'quote', text: 'Make it work, make it right, then make it fast.', attribution: 'Kent Beck' },
    ],
  ],
  [
    'g-text',
    'textFocus',
    [
      heading('Why loops matter'),
      paragraph('A loop lets one piece of code handle any amount of data.'),
      paragraph('Without loops a program would repeat the same lines by hand for every item.'),
      paragraph('Most programs spend nearly all of their time inside a loop of some kind.'),
    ],
  ],
  [
    'g-standard',
    'standard',
    [
      heading('Choosing a branch'),
      paragraph('Start with the simplest form that reads clearly.'),
      list('if and else', 'switch', 'ternary'),
      paragraph('Move to a richer form only when the simple one gets hard to read.'),
    ],
  ],
  [
    'g-split-photo',
    'standardSplit',
    [
      heading('Read the flow'),
      paragraph('Trace the code one branch at a time.'),
      paragraph('Most bugs hide where two branches meet.'),
      photo('A flowchart on a whiteboard'),
    ],
  ],
  [
    'g-image',
    'imageFocus',
    [
      heading('The whole picture'),
      paragraph('A diagram of the control flow shows every path at once.'),
      photo('A control flow diagram'),
    ],
  ],
  [
    'g-list-photo',
    'iconGrid',
    [
      heading('Debugging checklist'),
      list('Reproduce the bug', 'Print the state', 'Step through', 'Fix and retest'),
      photo('A desk with a laptop and notes'),
    ],
  ],
  [
    'g-hero-extra',
    'hero',
    [
      heading('Control Structures in C++'),
      paragraph('How a program decides what to do next.'),
      list('Branches', 'Loops', 'Jumps'),
      stat('3', 'loop forms'),
      stat('2', 'branch forms'),
    ],
  ],
  [
    'g-sidehead',
    'numberedList',
    [
      heading('Reading a loop'),
      paragraph('Trace one pass at a time.'),
      list(
        'Find the starting value of the counter.',
        'Check the condition before the body runs.',
        'Run the body once with the current value.',
        'Apply the update expression to the counter.',
      ),
      paragraph('Repeat until the check fails, then the loop is done.'),
    ],
  ],
  [
    'g-sidehead-stats',
    'statGrid',
    [
      heading('Loops in numbers'),
      paragraph('Three facts that hold for every loop you write.'),
      stat('3', 'loop forms'),
      stat('1', 'condition per loop'),
      stat('0', 'tolerance for infinite loops'),
      paragraph('Count them before you write the body.'),
    ],
  ],
  [
    'g-splitbody',
    'iconGrid',
    [
      heading('Why a loop that never ends is the most common mistake beginners make'),
      paragraph('The cause is almost always a counter that nothing updates.'),
      list('Forgot the update', 'Wrong comparison', 'Counter changed inside'),
      group('Easy to spot', 'The program hangs', 'The fan spins up'),
      group('Easy to fix', 'Add the update line', 'Check the condition'),
    ],
  ],
  ['g-section', 'section', [heading('Part two: making decisions')]],
  [
    'g-statement',
    'statement',
    [heading('One rule to keep'), paragraph('Every loop needs a way to end, or the program never finishes.')],
  ],
  [
    'g-twocol',
    'twoColumn',
    [
      heading('Why loops matter'),
      paragraph('A program that could only run each line once would be a calculator with a long tape.'),
      paragraph('A loop lets the same lines run again with a new value, so a few lines can handle a thousand cases.'),
      paragraph('The cost is that a loop must also know when to stop, and that is where most mistakes live.'),
    ],
  ],
  [
    'g-statsplit',
    'statSplit',
    [
      heading('Where loop bugs come from'),
      stat('72%', 'of loop bugs are a missing update'),
      list(
        'Forgot to change the counter',
        'Compared with the wrong operator',
        'Changed the counter inside the body',
      ),
    ],
  ],
  [
    'g-photolist',
    'photoList',
    [
      heading('Tracing a loop on paper'),
      list(
        'Write down the starting value of the counter.',
        'Check the condition before each pass of the body.',
        'Run the body once and note what it changed.',
        'Apply the update and check the condition again.',
      ),
      photo('A notebook with a loop traced in pencil'),
    ],
  ],
  [
    'g-steps',
    'steps',
    [
      heading('Fixing a loop that never ends'),
      step('Reproduce', 'Run the program and watch it hang.'),
      step('Locate', 'Find the loop that keeps running.'),
      step('Inspect', 'Print the counter on every pass.'),
      step('Fix', 'Change the update so the check can fail.'),
    ],
  ],
  [
    'g-beforeafter',
    'beforeAfter',
    [
      heading('Rewriting a loop'),
      group('Before', 'Counter set in three places', 'Condition buried in the body', 'Exit by break only'),
      group('After', 'Counter set in the header', 'Condition read at the top', 'Exit by the condition'),
    ],
  ],
  [
    'g-kicker',
    'standard',
    [
      { type: 'heading', text: 'Choosing a loop', kicker: 'Part two' },
      paragraph('Pick the form that matches what you know about the count.'),
    ],
  ],
]

/**
 * Development only: one slide per arrangement the slide redraw touches, with
 * realistic C++ teaching text, so a layout change can be checked on screen at
 * `/dev/slides?deck=gallery`. Every card names its layout outright where the
 * classifier would not award it. Only the dev page and tests import this.
 */
export const GALLERY_DECK: Card[] = SPECS.map(([id, layout, blocks], orderIndex) => ({
  id,
  orderIndex,
  layout,
  visualStyle: 'structured',
  blocks,
}))
