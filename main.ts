import { Plugin, Modal, App, Setting } from 'obsidian';
import { DEFAULT_SETTINGS, IndexNotesSettings, IndexNotesSettingTab } from 'src/settings/Settings';
import { IndexUpdater } from 'src/indexer';
import dateFormat from "dateformat";
import YAML from 'yaml'

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
			// Called when the user clicks the icon.
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

	async newNoteFromFocusedFile() {
		let ref_file = this.app.workspace.activeEditor?.file;
		if (!ref_file) {
			return;
		}

		let current_filepath = ref_file.path;
		let parent_dir = ref_file.parent?.path;
		let metadata_cache = this.app.metadataCache.getCache(current_filepath);
		var file_tags: string[] = [];
		if (metadata_cache?.frontmatter) {
			file_tags = metadata_cache.frontmatter.tags;
			file_tags = file_tags.filter(t => t !== this.settings.index_tag);
		}

		let now = new Date()
		let new_file_metadata = YAML.parse(this.settings.metadata_template
			.replace("{{today}}", dateFormat(now, "yyyy-mm-dd"))
			.replace("{{tags}}", file_tags.join(', '))
		);

		new PromptModal(this.app, async (result) => {
			let new_file_path = parent_dir + '/' + result + ".md"
			var new_file = await this.app.vault.create(new_file_path, "");
			await this.app.workspace.getLeaf(true).openFile(new_file, {
				active: true,
				state: {
					mode: "source"
				},
			})

			await this.app.fileManager.processFrontMatter(new_file, fm => {
				for (const [key, value] of Object.entries(new_file_metadata)) {
					fm[key] = value;
				}
				return fm;
			})
		}).open();
	}
}

class PromptModal extends Modal {
	result: string;
	onSubmit: (result: string) => void;

	constructor(app: App, onSubmit: (result: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		this.titleEl.innerText = "New note title"

		var settingEl = new Setting(this.contentEl)
			.addText((text) => {
				text.onChange((value) => {
					this.result = value
				});
				text.setPlaceholder("New note title");
				text.inputEl.addEventListener("keydown", (evt) => this.enterCallback(evt));
				text.inputEl.addClass("index-notes-new-note-title")
			});
		settingEl.infoEl.remove();
		settingEl.settingEl.focus();
	}

	enterCallback(evt: any) {
		if (evt.key === "Enter" && this.result.length) {
			this.close();
			this.onSubmit(this.result);
		}
	}
}