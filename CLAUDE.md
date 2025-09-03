# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

- **Development**: `npm run dev` - Starts esbuild in watch mode for hot reloading during development
- **Build**: `npm run build` - Runs TypeScript type checking and creates production build
- **Version**: `npm run version` - Bumps version in manifest.json and versions.json, then stages files for commit

## Project Architecture

This is an **Obsidian plugin** that automatically generates and maintains index blocks within notes based on hierarchical tags. The plugin scans the vault for notes with specific tag patterns and creates organized, nested lists of links.

### Core Components

- **`main.ts`** - Plugin entry point that handles initialization, settings, commands, and the "New note with same location and tags" feature
- **`src/indexer.ts`** - Core indexing engine containing the `IndexUpdater` class and `Node` tree structure for building indices
- **`src/settings/Settings.ts`** - Settings interface and UI tab for configuring plugin behavior
- **`src/settings/FolderSuggester.ts`** - UI component for folder selection in settings

### Key Concepts

- **Index Notes**: Notes tagged with `/idx` suffix automatically get index blocks generated
- **Meta Index Notes**: Notes tagged with `/meta_idx` suffix get indices of other index notes
- **Block References**: Each index is inserted with a unique block reference (e.g., `^indexof-projects`) for reliable updates
- **Tag Hierarchy**: Tags like `#projects/university/thesis` create nested index structures
- **Priority Tags**: Configurable tags that push notes to the top of index sections (formatted in bold)

### Build System

- Uses **esbuild** for fast bundling with TypeScript compilation
- Configured for Obsidian-specific externals (obsidian, electron, CodeMirror packages)
- Development mode includes inline sourcemaps and watch mode
- Production builds exclude sourcemaps and enable tree shaking

### Update Mechanism

The plugin runs on a configurable interval (default 5 seconds) to:
1. Scan all vault files for tag changes
2. Build a tree structure from hierarchical tags
3. Generate formatted markdown index blocks
4. Update existing blocks using block references or append new ones

## Development Notes

- TypeScript with strict null checks enabled
- No ESLint/Prettier configuration currently set up
- Dependencies include dateformat and YAML for metadata template processing
- Plugin settings support folder exclusion, custom tag names, and metadata templates
- Error handling implemented throughout with console logging