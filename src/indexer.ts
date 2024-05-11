import { App, PluginSettingTab, TFile } from 'obsidian';
import IndexNotesPlugin from "main";
import { IndexNotesSettings } from 'src/settings/Settings';
import { title } from 'process';
import { string } from 'yaml/dist/schema/common/string';

function string_hash(s: string): string {
    var hash = 0,
        i, chr;
    if (s.length === 0) return String(hash);
    for (i = 0; i < s.length; i++) {
        chr = s.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return String(hash);
}

function format_tag_word(tag_word: string): string {
    if (tag_word.startsWith('_')) {
        // parts that start with _ are all caps
        return tag_word.slice(1).toUpperCase();
    } else {
        return tag_word;
    }
}

function capitalize_first(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Splits tags into words and formats all caps if the word also starts with an underscore.
 * E.g.: tag "__rl_and__ml" would become "RL and ML"
 */
function tag_to_header(t: string): string {
    var tag_components = []
    for (let component of t.split("/")) {
        var words = component.split(/(?<!^)(?<!_)_/).map(format_tag_word);
        tag_components.push(capitalize_first(words.join(' ')));
    }
    return tag_components.join(' / ')
}

/**
 * Makes a block reference string where non-word symbols are replaced by -
 */
function tag_to_block_reference(tag: string): string {
    if (!tag) {
        tag = "main-index";
    }
    return '^' + ('indexof-' + tag).replace(/[^a-zA-Z]+/g, '-');
}

/**
 * Builds the regex to match an index block by reference (and including the reference)
 */
function get_block_regex(block_ref: string): RegExp {
    return new RegExp("(?:^>.*\\n)*>\\s*\\" + block_ref + "$", "gm");
}

function filename_to_header(filename: string): string {
    return capitalize_first(filename.split(".")[0])
}

function get_last_tag_component(tag_path: string) {
    return tag_path.split('/').last()!
}

function canonicalize_tag(tag: string): string {
    var canonical = tag.trim().toLowerCase();
    if (canonical.endsWith("/")) {
        canonical = canonical.substring(0, canonical.length - 1);
    }
    if (canonical.startsWith("/")) {
        canonical = canonical.substring(1);
    }
    return canonical;
}

function get_note_title(note: TFile, prefix: string = "") {
    var note_title = this.app.metadataCache.getCache(note.path)?.frontmatter?.title;
    if (note_title) {
        if (note_title?.length > 50) {
            note_title = note_title.substring(0, 50) + "..."
        }
        return prefix + note_title;
    }
    return ""
}

function sortable(s: string) {
    // Remove non-GSM characters
    s = s.replace(/[^A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅå\x{0394}_\x{03A6}\x{0393}\x{039B}\x{03A9}\x{03A0}\x{03A8}\x{03A3}\x{0398}\x{039E}ÆæßÉ!\"#$%&\'\(\)*+,\-.\/:;<=>;?¡ÄÖÑÜ§¿äöñüà^{}\[\~\]\|\x{20AC}\\]/g, '');
    return s.trim().toLowerCase();
}

function compare_strings(a: string, b: string) {
    let s_a = sortable(a);
    let s_b = sortable(b);
    if (s_a > s_b) return 1;
    if (s_a < s_b) return -1;
    return 0;
}

class Node {
    tag_path: string
    header_note: TFile | undefined
    regular_notes: TFile[] = []
    priority_notes: TFile[] = []
    index_notes: TFile[] = []
    index_priority_notes: TFile[] = []
    children: Node[] = []
    settings: IndexNotesSettings
    app: App

    constructor(tag_path: string, settings: IndexNotesSettings, app: App) {
        this.tag_path = canonicalize_tag(tag_path);
        this.settings = settings;
        this.app = app;
    }

    get_all_notes() {
        var all_notes = this.priority_notes.concat(this.regular_notes)
        if (this.header_note) all_notes.push(this.header_note);
        return all_notes;
    }

    sort_all() {
        this.priority_notes.sort((a, b) => compare_strings(a.name, b.name));
        this.regular_notes.sort((a, b) => compare_strings(a.name, b.name));
        this.index_notes.sort((a, b) => compare_strings(a.name, b.name));
        this.children.sort((a, b) => compare_strings(tag_to_header(a.tag_component()), tag_to_header(b.tag_component())));
        for (var child of this.children) {
            child.sort_all();
        }
    }

    tag_component() {
        return get_last_tag_component(this.tag_path);
    }

    get_index(index_note: TFile, indent_level: number = 0): string {
        var index_txt = ""
        for (let note of this.priority_notes) {
            if (note.path === index_note.path) continue;
            let mdlink = this.app.fileManager.generateMarkdownLink(note, index_note.path, undefined, filename_to_header(note.name));
            let note_title = get_note_title(note, ": ")
            index_txt += '> ' + '\t'.repeat(indent_level) + "- **" + mdlink + note_title + '**\n';
        }
        for (let note of this.regular_notes) {
            if (note.path === index_note.path) continue;
            let mdlink = this.app.fileManager.generateMarkdownLink(note, index_note.path, undefined, filename_to_header(note.name));
            let note_title = get_note_title(note, ": ")
            index_txt += '> ' + '\t'.repeat(indent_level) + "- " + mdlink + note_title + '\n';
        }
        for (let note of this.index_notes) {
            if (note.path === index_note.path) continue;
            let mdlink = this.app.fileManager.generateMarkdownLink(note, index_note.path, undefined, filename_to_header(note.name));
            let note_title = get_note_title(note, ": ")
            index_txt += '> ' + '\t'.repeat(indent_level) + "- " + mdlink + note_title + '\n';
        }
        for (let child of this.children) {
            if (child.header_note) {
                let mdlink = this.app.fileManager.generateMarkdownLink(child.header_note, index_note.path, undefined, filename_to_header(child.header_note.name));
                index_txt += '> ' + '\t'.repeat(indent_level) + "- **" + mdlink + "**\n";
            } else {
                index_txt += '> ' + '\t'.repeat(indent_level) + "- **" + tag_to_header(child.tag_component()) + "**" + '\n';
            }
            index_txt += child.get_index(index_note, indent_level + 1);
        }
        return index_txt;
    }

    get_meta_index(index_note: TFile) {
        var index_txt = ""
        var notes = new Set<TFile>();
        var priority_notes = new Set<TFile>();
        for (let child of this.children) {
            for (let note of child.index_notes) {
                if (note.path === index_note.path) continue;
                notes.add(note);
            }
            for (let note of child.index_priority_notes) {
                if (note.path === index_note.path) continue;
                priority_notes.add(note);
            }
        }
        for (let note of [...priority_notes].sort((a, b) => compare_strings(a.name, b.name))) {
            let mdlink = this.app.fileManager.generateMarkdownLink(note, index_note.path, undefined, filename_to_header(note.name));
            let note_title = get_note_title(note, ": ")
            index_txt += "> \n";
            index_txt += "> > [!tldr] " + mdlink + note_title + '\n';
        }
        for (let note of [...notes].sort((a, b) => compare_strings(a.name, b.name))) {
            let mdlink = this.app.fileManager.generateMarkdownLink(note, index_note.path, undefined, filename_to_header(note.name));
            let note_title = get_note_title(note, ": ")
            index_txt += "> \n";
            index_txt += "> > [!example] " + mdlink + note_title + '\n';
        }
        return index_txt;
    }

    find_child_node(tag_path: string): Node | undefined {
        tag_path = canonicalize_tag(tag_path);
        if (tag_path === this.tag_path) {
            return this;
        } else if (tag_path.startsWith(this.tag_path)) {
            let next_component = canonicalize_tag(tag_path.slice(this.tag_path.length)).split('/')[0]
            for (let child of this.children) {
                if (child.tag_component() === next_component) {
                    return child.find_child_node(tag_path);
                }
            }
        }
        console.log("ERROR: did not find node at path \"" + tag_path + "\"");
        return undefined;
    }

    add_note_with_path(tag_path: string, note: TFile, has_priority: boolean, is_index: boolean): boolean {
        tag_path = canonicalize_tag(tag_path);
        if (tag_path === this.tag_path) {
            if (is_index && has_priority) {
                this.index_priority_notes.push(note);
            } else if (is_index) {
                this.index_notes.push(note);
            } else if (filename_to_header(note.name) === tag_to_header(this.tag_component())) {
                this.header_note = note;
            } else if (has_priority) {
                this.priority_notes.push(note);
            } else {
                this.regular_notes.push(note);
            }
            return true;
        } else if (tag_path.startsWith(this.tag_path)) {
            let next_component = canonicalize_tag(tag_path.slice(this.tag_path.length)).split('/')[0]
            for (let child of this.children) {
                if (child.tag_component() === next_component) {
                    return child.add_note_with_path(tag_path, note, has_priority, is_index);
                }
            }
            let next_tag_path = this.tag_path.length ? [this.tag_path, next_component].join("/") : next_component;
            var new_node = new Node(next_tag_path, this.settings, this.app)
            let success = new_node.add_note_with_path(tag_path, note, has_priority, is_index);
            if (!success) {
                console.log("ERROR: could not add path for note: ", tag_path + "|" + next_tag_path, this);
            }
            this.children.push(new_node);
            return success;
        }
        return false;
    }

    get_hash(): string {
        var to_hash = this.get_all_notes().map(n => n.path).join()
        to_hash += this.tag_path;
        to_hash += this.children.map(c => c.get_hash()).join()
        return string_hash(to_hash);
    }
}

class IndexNote {
    note: TFile
    index_tags: string[] = []
    meta_index_tags: string[] = []
    app: App
    settings: IndexNotesSettings

    constructor(note: TFile, app: App, settings: IndexNotesSettings) {
        this.note = note;
        this.app = app;
        this.settings = settings;
    }

    get_hash(): string {
        this._sort_index_tags();
        var to_hash = "INDEX:" + String(this.index_tags.length) + this.index_tags.join();
        to_hash += "META:" + String(this.meta_index_tags.length) + this.meta_index_tags.join();
        return string_hash(to_hash);
    }

    _make_index_title(root_tag: string, prefix: string) {
        return prefix + tag_to_header(root_tag) + "\n";
    }

    _sort_index_tags() {
        this.index_tags = this.index_tags.sort((a, b) => compare_strings(get_last_tag_component(a), get_last_tag_component(b)));
        this.meta_index_tags = this.meta_index_tags.sort((a, b) => compare_strings(get_last_tag_component(a), get_last_tag_component(b)));
    }

    create_index_blocks(root_node: Node): Array<[string, string]> {
        this._sort_index_tags();
        var index_blocks = new Array<[string, string]>();
        for (let index_tag of this.index_tags) {
            var block_text = ""

            // Adding index title
            block_text += "> [!example] " + this._make_index_title(index_tag, "");

            // Adding index content
            let source_note = root_node.find_child_node(index_tag);
            if (source_note) {
                block_text += source_note.get_index(this.note);
            }
            let block_reference = tag_to_block_reference(index_tag);
            block_text += "> \n> " + block_reference;
            
            index_blocks.push([block_reference, block_text]);
        }
        for (let index_tag of this.meta_index_tags) {
            var block_text = ""

            // Adding index title
            block_text += "> [!example] " + this._make_index_title(index_tag, index_tag ? "Meta-index of: " : "Meta-index");

            // Adding index content
            let source_note = root_node.find_child_node(index_tag);
            if (source_note) {
                block_text += source_note.get_meta_index(this.note);
            }
            let block_reference = tag_to_block_reference(index_tag);
            block_text += "> \n> " + block_reference;
            
            index_blocks.push([block_reference, block_text]);
        }
        return index_blocks
    }

    get_updated_content(content: string, index_blocks: Array<[string, string]>): string {
        var result = content;
        var written_blocks = new Set<string>();
        for (let [block_reference, block_content] of index_blocks) {
            let block_regex = get_block_regex(block_reference);
            if (result.match(block_regex)) {
                result = result.replace(block_regex, block_content);
            } else (
                result += '\n\n' + block_content
            )
            written_blocks.add(block_reference);
        }
        // Remove untracked indices, in case the index tag was changed
        for (let existing_reference of result.matchAll(/\^indexof-(?:[a-zA-Z0-9]+-?)+/g)) {
            if (!written_blocks.has(existing_reference[0])) {
                result = result.replace(get_block_regex(existing_reference[0]), "");
            }

        }

        return result;
    }
}

class IndexSchema {
    index_notes: IndexNote[] = [];
    root_node: Node;

    get_hash(): string {
        return string_hash(this.root_node.get_hash() + this.index_notes.map(n => n.get_hash()).join())
    }
}


export class IndexUpdater {
    app: App
    settings: IndexNotesSettings
    previous_hash: String = ""

    constructor(app: App, settings: IndexNotesSettings) {
        this.app = app;
        this.settings = settings;
    }

    scan(): IndexSchema {
        let excluded_folders = this.settings.exclude_folders.filter(f => f.length > 0);
        var md_files = this.app.vault.getMarkdownFiles().filter(f => !excluded_folders.some(excl => f.path.startsWith(excl)));
        var index_schema = new IndexSchema();
        var root_node = new Node("", this.settings, this.app);
        let regex_index_tag_components = new RegExp("(?:^|(?:\/))(?:" + this.settings.index_tag + ")|(?:" + this.settings.meta_index_tag + ")$")
        let regex_contains_index = new RegExp(/\^indexof-(?:[a-zA-Z0-9]+-?)+/g);
        for (let note of md_files) {
            let frontmatter = this.app.metadataCache.getCache(note.path)?.frontmatter;
            let index_note = new IndexNote(note, this.app, this.settings);
            if (frontmatter) {
                var file_tags: string[] | undefined = frontmatter.tags;
                if (!file_tags) {
                    continue;
                }
                let has_priority_tag = file_tags.contains(this.settings.priority_tag);
                for (let tag of file_tags) {
                    let canonical_tag = canonicalize_tag(tag);
                    let clean_tag_path = canonicalize_tag(canonical_tag.replace(regex_index_tag_components, ""));
                    if (get_last_tag_component(canonical_tag) === this.settings.index_tag) {
                        index_note.index_tags.push(clean_tag_path);
                        root_node.add_note_with_path(clean_tag_path, note, has_priority_tag, true);
                    } else if (get_last_tag_component(canonical_tag) === this.settings.meta_index_tag) {
                        index_note.meta_index_tags.push(clean_tag_path);
                        root_node.add_note_with_path(clean_tag_path, note, has_priority_tag, true);
                    } else {
                        root_node.add_note_with_path(clean_tag_path, note, has_priority_tag, false);
                    }
                }
            }
            
            if (index_note.index_tags.length || index_note.meta_index_tags.length) {
                index_schema.index_notes.push(index_note);
            } else {
                this.app.vault.read(note).then(v => {
                    // Add notes with regular note with stale indices so they will be cleaned up
                    if (v.match(regex_contains_index)) {
                        index_schema.index_notes.push(index_note);
                    }
                });

            }
        }
        root_node.sort_all();
        index_schema.root_node = root_node;
        return index_schema
    }

    update() {
        let t0 = Date.now();
        let index_schema = this.scan();
        for (let index_note of index_schema.index_notes) {
            let index_blocks = index_note.create_index_blocks(index_schema.root_node);
            this.app.vault.process(index_note.note, (data) => {
                return index_note.get_updated_content(data, index_blocks);
            })
        }
        console.log("Updating took " + (Date.now() - t0) + " ms");
    }
}
