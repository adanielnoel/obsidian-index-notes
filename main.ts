import { Plugin, Modal, App, Setting } from 'obsidian';
import { DEFAULT_SETTINGS, IndexNotesSettings, IndexNotesSettingTab } from 'src/settings/Settings';
import { IndexUpdater } from 'src/indexer';
import dateFormat from "dateformat";
import YAML from 'yaml'

const DATE_FORMAT = "yyyy-mm-dd";
const MARKDOWN_EXTENSION = ".md";

export default class IndexNotesPlugin extends Plugin {
	settings: IndexNotesSettings;
	update_interval_id: number;
	index_updater: IndexUpdater;

	async onload() {
		await this.loadSettings();

		this.index_updater = new IndexUpdater(this.app, this.settings);
		this.index_updater.update();
		this.reset_update_interval();

		this.addSettingTab(new IndexNotesSettingTab(this.app, this));

		this.addCommand({
			id: 'new-note-same-loc-and-tags',
			name: 'New note with same location and tags',
			callback: async () => {
				await this.newNoteFromFocusedFile();
			}
		});

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('copy-plus', 'New note by copying metadata of focused note', async () => {
			await this.newNoteFromFocusedFile();
		});
	}

	onunload() {
		window.clearInterval(this.update_interval_id);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	reset_update_interval() {
		window.clearInterval(this.update_interval_id);
		this.update_interval_id = window.setInterval(() => this.index_updater.update(), this.settings.update_interval_seconds * 1000);
	}

	async createFileWithContentAndOpen(newFilePath: string, fileContent: string, metadata: Object) {
		try {
			let new_file = await this.app.vault.create(newFilePath, fileContent);
			await this.app.workspace.getLeaf(true).openFile(new_file, {
				active: true,
				state: {
					mode: "source"
				},
			});

			await this.app.fileManager.processFrontMatter(new_file, fm => {
				for (const [key, value] of Object.entries(metadata)) {
					fm[key] = value;
				}
				return fm;
			});
		} catch (error) {
			console.error("Error creating or processing new file:", error);
		}
	}

	async newNoteFromFocusedFile() {
		let ref_file = this.app.workspace.activeEditor?.file;
		if (!ref_file) {
			return;
		}

		let current_filepath = ref_file.path;
		let parent_dir = ref_file.parent?.path;
		let metadata_cache = this.app.metadataCache.getCache(current_filepath);
		let file_tags: string[] = [];
		if (metadata_cache?.frontmatter) {
			file_tags = metadata_cache.frontmatter.tags;
			file_tags = file_tags.filter(t => t !== this.settings.index_tag);
		}

		let now = new Date();
		let new_file_metadata: Object;
		try {
			new_file_metadata = YAML.parse(this.settings.metadata_template
				.replace("{{today}}", dateFormat(now, DATE_FORMAT))
				.replace("{{tags}}", file_tags.join(', '))
			);
		} catch (error) {
			console.error("Error parsing YAML metadata:", error);
			return;
		}

		new PromptModal(this.app, "New note title", async (result) => {
			let new_file_path = `${parent_dir}/${result}${MARKDOWN_EXTENSION}`;
			try {
				this.createFileWithContentAndOpen(new_file_path, "", new_file_metadata);
			} catch (error) {
				console.error("Error creating and opening file:", error);
			}
		}).open();
	}
}

class PromptModal extends Modal {
	result: string;
	prompt: string;
	onSubmit: (result: string) => void;

	constructor(app: App, prompt: string, onSubmit: (result: string) => void) {
		super(app);
		this.prompt = prompt;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		try {
			this.titleEl.innerText = this.prompt;

			let settingEl = new Setting(this.contentEl)
				.addText((text) => {
					text.onChange((value) => {
						this.result = value;
					});
					text.setPlaceholder("");
					text.inputEl.addEventListener("keydown", (evt) => this.enterCallback(evt));
					text.inputEl.addClass("index-notes-prompt-modal-input");
				});
			settingEl.infoEl.remove();
			settingEl.settingEl.focus();
		} catch (error) {
			console.error("Error setting up modal elements:", error);
		}
	}

	enterCallback(evt: any) {
		try {
			if (evt.key === "Enter" && this.result.length) {
				this.close();
				this.onSubmit(this.result);
			}
		} catch (error) {
			console.error("Error handling enter key press:", error);
		}
	}
}
