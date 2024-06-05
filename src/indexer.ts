import { App, PluginSettingTab, TFile } from 'obsidian';
import IndexNotesPlugin from "main";
import { IndexNotesSettings } from 'src/settings/Settings';
import { title } from 'process';

function stringHash(s: string): string {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        const chr = s.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return String(hash);
}

function formatTagWord(tagWord: string): string {
    return tagWord.startsWith('_') ? tagWord.slice(1).toUpperCase() : tagWord;
}

function capitalizeFirst(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Splits tags into words and formats all caps if the word also starts with an underscore.
 * E.g.: tag "__rl_and__ml" would become "RL and ML"
 *
 * @param {string} t - The tag string to be formatted into a header.
 * @returns {string} The formatted header string.
 */
function tagToHeader(t: string): string {
    return t.split("/").map(component => {
        const words = component.split('_').map((word, index, arr) => {
            if (word === '') {
                return '';
            }
            if (index > 0 && arr[index - 1] === '') {
                return formatTagWord('_' + word);
            }
            return formatTagWord(word);
        }).filter(word => word !== '');
        return capitalizeFirst(words.join(' '));
    }).join(' / ');
}

/**
 * Creates a block reference string where non-word symbols are replaced by dashes.
 * The default tag used is "main-index" if none is provided.
 *
 * @param {string} [tag="main-index"] - The tag to convert into a block reference.
 * @returns {string} The block reference string.
 */
function tagToBlockReference(tag: string = "main-index"): string {
    if (tag.length === 0) {
        return '^indexof-root000';
    }
    return '^' + ('indexof-' + tag).replace(/[^a-zA-Z]+/g, '-');
}

function getBlockRegex(blockRef: string): RegExp {
    return new RegExp(`^(?:>\\s*\\[!example\\].*\\n)(?:>.*\\n)*(?:>\\s*\\${blockRef}$)`, "gm");
}

function filenameToHeader(filename: string): string {
    return capitalizeFirst(filename.split(".")[0]);
}

function getLastTagComponent(tagPath: string): string {
    return tagPath.split('/').pop()!;
}

function canonicalizeTag(tag: string): string {
    return tag.trim().toLowerCase().replace(/^\/|\/$/g, '');
}

function getNoteTitle(note: TFile, app: App, prefix: string = ""): string {
    const noteTitle = app.metadataCache.getCache(note.path)?.frontmatter?.title;
    return noteTitle ? prefix + (noteTitle.length > 50 ? noteTitle.substring(0, 50) + "..." : noteTitle) : "";
}

function sortable(s: string): string {
    return s.replace(/[^A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔΦΓΛΩΠΘΣΘΞÆæßÉ!"#$%&'()*+,\-.\/:;<=>;?¡ÄÖÑÜ§¿äöñüà^{}\[\~\]\|\€\\]/g, '').trim().toLowerCase();
}

function compareStrings(a: string, b: string): number {
    const sA = sortable(a);
    const sB = sortable(b);
    return sA.localeCompare(sB);
}

class Node {
    tagPath: string;
    headerNote: TFile | undefined;
    regularNotes: TFile[] = [];
    priorityNotes: TFile[] = [];
    indexNotes: TFile[] = [];
    indexPriorityNotes: TFile[] = [];
    children: Node[] = [];
    settings: IndexNotesSettings;
    app: App;

    constructor(tagPath: string, settings: IndexNotesSettings, app: App) {
        this.tagPath = canonicalizeTag(tagPath);
        this.settings = settings;
        this.app = app;
    }

    getAllNotes(): TFile[] {
        return this.headerNote ? this.priorityNotes.concat(this.regularNotes, [this.headerNote]) : this.priorityNotes.concat(this.regularNotes);
    }

    sortAll(): void {
        this.priorityNotes.sort((a, b) => compareStrings(a.name, b.name));
        this.regularNotes.sort((a, b) => compareStrings(a.name, b.name));
        this.indexNotes.sort((a, b) => compareStrings(a.name, b.name));
        this.children.sort((a, b) => compareStrings(tagToHeader(a.tagComponent()), tagToHeader(b.tagComponent())));
        this.children.forEach(child => child.sortAll());
    }

    tagComponent(): string {
        return getLastTagComponent(this.tagPath);
    }

    getIndex(indexNote: TFile, indentLevel: number = 0): string {
        let indexTxt = this.priorityNotes.concat(this.regularNotes, this.indexNotes).filter(note => note.path !== indexNote.path).map(note => {
            const mdLink = this.app.fileManager.generateMarkdownLink(note, indexNote.path, undefined, filenameToHeader(note.name));
            const noteTitle = getNoteTitle(note, this.app, ": ");
            return `> ${'\t'.repeat(indentLevel)}- ${this.priorityNotes.includes(note) ? '**' : ''}${mdLink}${noteTitle}${this.priorityNotes.includes(note) ? '**' : ''}\n`;
        }).join('');

        this.children.forEach(child => {
            const mdLink = child.headerNote ? this.app.fileManager.generateMarkdownLink(child.headerNote, indexNote.path, undefined, filenameToHeader(child.headerNote.name)) : '';
            indexTxt += `> ${'\t'.repeat(indentLevel)}- **${mdLink || tagToHeader(child.tagComponent())}**\n`;
            indexTxt += child.getIndex(indexNote, indentLevel + 1);
        });

        return indexTxt;
    }

    getMetaIndex(indexNote: TFile): string {
        let indexTxt = "";
        const notes = new Set<TFile>();
        const priorityNotes = new Set<TFile>();

        this.children.forEach(child => {
            child.indexNotes.forEach(note => {
                if (note.path !== indexNote.path) notes.add(note);
            });
            child.indexPriorityNotes.forEach(note => {
                if (note.path !== indexNote.path) priorityNotes.add(note);
            });
        });

        [...priorityNotes].sort((a, b) => compareStrings(a.name, b.name)).forEach(note => {
            const mdLink = this.app.fileManager.generateMarkdownLink(note, indexNote.path, undefined, filenameToHeader(note.name));
            const noteTitle = getNoteTitle(note, this.app, ": ");
            indexTxt += `> \n> > [!tldr] ${mdLink}${noteTitle}\n`;
        });

        [...notes].sort((a, b) => compareStrings(a.name, b.name)).forEach(note => {
            const mdLink = this.app.fileManager.generateMarkdownLink(note, indexNote.path, undefined, filenameToHeader(note.name));
            const noteTitle = getNoteTitle(note, this.app, ": ");
            indexTxt += `> \n> > [!example] ${mdLink}${noteTitle}\n`;
        });

        return indexTxt;
    }

    findChildNode(tagPath: string): Node | undefined {
        tagPath = canonicalizeTag(tagPath);
        if (tagPath === this.tagPath) {
            return this;
        } else if (tagPath.startsWith(this.tagPath)) {
            const nextComponent = canonicalizeTag(tagPath.slice(this.tagPath.length)).split('/')[0];
            const child = this.children.find(child => child.tagComponent() === nextComponent);
            return child ? child.findChildNode(tagPath) : undefined;
        }
        console.log("ERROR: did not find node at path \"" + tagPath + "\"");
        return undefined;
    }

    addNoteWithPath(tagPath: string, note: TFile, hasPriority: boolean, isIndex: boolean): boolean {
        tagPath = canonicalizeTag(tagPath);
        if (tagPath === this.tagPath) {
            if (isIndex && hasPriority) {
                this.indexPriorityNotes.push(note);
            } else if (isIndex) {
                this.indexNotes.push(note);
            } else if (filenameToHeader(note.name) === tagToHeader(this.tagComponent())) {
                this.headerNote = note;
            } else if (hasPriority) {
                this.priorityNotes.push(note);
            } else {
                this.regularNotes.push(note);
            }
            return true;
        } else if (tagPath.startsWith(this.tagPath)) {
            const nextComponent = canonicalizeTag(tagPath.slice(this.tagPath.length)).split('/')[0];
            let child = this.children.find(child => child.tagComponent() === nextComponent);
            if (child) {
                return child.addNoteWithPath(tagPath, note, hasPriority, isIndex);
            }
            const nextTagPath = this.tagPath ? `${this.tagPath}/${nextComponent}` : nextComponent;
            const newNode = new Node(nextTagPath, this.settings, this.app);
            const success = newNode.addNoteWithPath(tagPath, note, hasPriority, isIndex);
            if (!success) {
                console.log("ERROR: could not add path for note: ", tagPath + "|" + nextTagPath, this);
            }
            this.children.push(newNode);
            return success;
        }
        return false;
    }

    getHash(): string {
        const toHash = this.getAllNotes().map(n => n.path).join() + this.tagPath + this.children.map(c => c.getHash()).join();
        return stringHash(toHash);
    }
}

class IndexNote {
    note: TFile;
    indexTags: string[] = [];
    metaIndexTags: string[] = [];
    app: App;
    settings: IndexNotesSettings;

    constructor(note: TFile, app: App, settings: IndexNotesSettings) {
        this.note = note;
        this.app = app;
        this.settings = settings;
    }

    getHash(): string {
        this.sortIndexTags();
        const toHash = `INDEX:${String(this.indexTags.length)}${this.indexTags.join()}META:${String(this.metaIndexTags.length)}${this.metaIndexTags.join()}`;
        return stringHash(toHash);
    }

    makeIndexTitle(rootTag: string, prefix: string): string {
        return prefix + tagToHeader(rootTag) + "\n";
    }

    sortIndexTags(): void {
        this.indexTags.sort((a, b) => compareStrings(getLastTagComponent(a), getLastTagComponent(b)));
        this.metaIndexTags.sort((a, b) => compareStrings(getLastTagComponent(a), getLastTagComponent(b)));
    }

    createIndexBlocks(rootNode: Node): Array<[string, string]> {
        this.sortIndexTags();
        const indexBlocks: Array<[string, string]> = [];
        this.indexTags.forEach(indexTag => {
            let blockText = `> [!example] ${this.makeIndexTitle(indexTag, "")}`;
            const sourceNote = rootNode.findChildNode(indexTag);
            if (sourceNote) {
                blockText += sourceNote.getIndex(this.note);
            }
            const blockReference = tagToBlockReference(indexTag);
            blockText += `> \n> ${blockReference}`;
            indexBlocks.push([blockReference, blockText]);
        });
        this.metaIndexTags.forEach(indexTag => {
            let blockText = `> [!example] ${this.makeIndexTitle(indexTag, indexTag ? "Meta-index of: " : "Meta-index")}`;
            const sourceNote = rootNode.findChildNode(indexTag);
            if (sourceNote) {
                blockText += sourceNote.getMetaIndex(this.note);
            }
            const blockReference = tagToBlockReference(indexTag);
            blockText += `> \n> ${blockReference}`;
            indexBlocks.push([blockReference, blockText]);
        });
        return indexBlocks;
    }

    getUpdatedContent(content: string, indexBlocks: Array<[string, string]>): string {
        let result = content;
        const writtenBlocks = new Set<string>();
        indexBlocks.forEach(([blockReference, blockContent]) => {
            const blockRegex = getBlockRegex(blockReference);
            if (result.match(blockRegex)) {
                result = result.replace(blockRegex, blockContent);
            } else {
                result += '\n\n' + blockContent;
            }
            writtenBlocks.add(blockReference);
        });
        // Remove untracked indices and duplicates of tracked indices
        Array.from(result.matchAll(/\^indexof-(?:[a-zA-Z0-9]+-?)+/g)).forEach(existingReference => {
            const blockRegex = getBlockRegex(existingReference[0]);
            let matches = Array.from(result.matchAll(blockRegex));
            let deletedOffset = 0;
            let i = -1;
            for (let match of matches) {
                i++;
                if (writtenBlocks.has(existingReference[0]) && i === 0) {
                    continue;
                }
                if (match.index === undefined) {
                    continue;
                }
                let startIndex = match.index - deletedOffset;
                let endIndex = startIndex + match[0].length;
                deletedOffset += match[0].length;
                result = result.slice(0, startIndex) + result.slice(endIndex);
            }
        });
        return result;
    }
}

class IndexSchema {
    indexNotes: IndexNote[] = [];
    rootNode: Node;

    getHash(): string {
        return stringHash(this.rootNode.getHash() + this.indexNotes.map(n => n.getHash()).join());
    }
}

export class IndexUpdater {
    app: App;
    settings: IndexNotesSettings;
    previousHash: string = "";

    constructor(app: App, settings: IndexNotesSettings) {
        this.app = app;
        this.settings = settings;
    }

    scan(): IndexSchema {
        const excludedFolders = this.settings.exclude_folders.filter(f => f.length > 0);
        const mdFiles = this.app.vault.getMarkdownFiles().filter(f => !excludedFolders.some(excl => f.path.startsWith(excl)));
        const indexSchema = new IndexSchema();
        const rootNode = new Node("", this.settings, this.app);
        const regexIndexTagComponents = new RegExp(`(?:^|(?:\/))(?:${this.settings.index_tag})|(?:${this.settings.meta_index_tag})$`);
        const regexContainsIndex = /\^indexof-(?:[a-zA-Z0-9]+-?)+/g;
        mdFiles.forEach(note => {
            const frontmatter = this.app.metadataCache.getCache(note.path)?.frontmatter;
            const indexNote = new IndexNote(note, this.app, this.settings);
            if (frontmatter) {
                let fileTags: string | string[] | undefined = frontmatter.tags;
                if (typeof fileTags === 'string') {
                    fileTags = fileTags.split(',').map(tag => tag.trim());
                }
                if (!fileTags || !Array.isArray(fileTags)) {
                    console.log("File tags are not an array: ", fileTags);
                    return;
                }
                const hasPriorityTag = fileTags.includes(this.settings.priority_tag);
                fileTags.forEach(tag => {
                    const canonicalTag = canonicalizeTag(tag);
                    const cleanTagPath = canonicalizeTag(canonicalTag.replace(regexIndexTagComponents, ""));
                    if (getLastTagComponent(canonicalTag) === this.settings.index_tag) {
                        indexNote.indexTags.push(cleanTagPath);
                        rootNode.addNoteWithPath(cleanTagPath, note, hasPriorityTag, true);
                    } else if (getLastTagComponent(canonicalTag) === this.settings.meta_index_tag) {
                        indexNote.metaIndexTags.push(cleanTagPath);
                        rootNode.addNoteWithPath(cleanTagPath, note, hasPriorityTag, true);
                    } else {
                        rootNode.addNoteWithPath(cleanTagPath, note, hasPriorityTag, false);
                    }
                });
            }

            if (indexNote.indexTags.length || indexNote.metaIndexTags.length) {
                indexSchema.indexNotes.push(indexNote);
            } else {
                this.app.vault.read(note).then(v => {
                    // Add notes with regular note with stale indices so they will be cleaned up
                    if (v.match(regexContainsIndex)) {
                        indexSchema.indexNotes.push(indexNote);
                    }
                });
            }
        });
        rootNode.sortAll();
        indexSchema.rootNode = rootNode;
        return indexSchema;
    }

    update(): void {
        const t0 = Date.now();
        const indexSchema = this.scan();
        indexSchema.indexNotes.forEach(indexNote => {
            const indexBlocks = indexNote.createIndexBlocks(indexSchema.rootNode);
            this.app.vault.process(indexNote.note, data => {
                return indexNote.getUpdatedContent(data, indexBlocks);
            });
        });
        // console.log("Updating took " + (Date.now() - t0) + " ms");
    }
}
