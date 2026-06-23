# Epic Awesome Boss Fight

A diamond-shaped puzzle game built with Next.js, TypeScript, and React.

## Getting Started

### Prerequisites
- Node.js 18.17 or later
- npm

### Installation

\\\ash
npm install
\\\

### Development

\\\ash
npm run dev
\\\

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

\\\ash
npm run build
npm start
\\\

## Project Structure

- \pp/page.tsx\ - Main page entry point
- \pp/components/DiamondGrid.tsx\ - Grid display component
- \pp/utils/gridConfig.ts\ - Grid tile configuration
- \pp/layout.tsx\ - Root layout
- \pp/styles/globals.css\ - Global styles

## Features

- Diamond-shaped grid layout
- Responsive SVG rendering
- TypeScript support
- Tailwind CSS styling

## Static Apps On Vercel

Two standalone HTML/CSS/JS apps are hosted from `public/static-apps` and exposed at:

- `/temple-entrance-puzzle`
- `/water-puzzle`

Additional files in those folders remain accessible as subpaths, for example:

- `/water-puzzle/level-builder.html`
