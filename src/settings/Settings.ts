import { App, Notice, PluginSettingTab, Setting, parseYaml } from 'obsidian';
import IndexNotesPlugin from "main";
import { FolderSuggest } from "./FolderSuggester";

export interface IndexNotesSettings {
    update_interval_seconds: number;
    exclude_folders: string[];
    index_tag: string;
    meta_index_tag: string;
    priority_tag: string;
    show_note_title: boolean;
    metadata_template: string;
}

export const DEFAULT_SETTINGS: IndexNotesSettings = {
    update_interval_seconds: 5,
    exclude_folders: [],
    index_tag: 'idx',
    meta_index_tag: 'meta_idx',
    priority_tag: '',
    show_note_title: true,
    metadata_template: 'date_created: {{today}}\ntags: {{tags}}'
}

export class IndexNotesSettingTab extends PluginSettingTab {
    plugin: IndexNotesPlugin;

    constructor(app: App, plugin: IndexNotesPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        this.containerEl.empty();
        this.add_index_tag_setting();
        this.add_meta_index_tag_setting();
        this.add_priority_tag_setting();
        this.add_update_interval_setting();
        this.add_show_note_title();
        this.add_exclude_folders_setting();
        this.add_metadata_template();
    }

    add_index_tag_setting() {
        new Setting(this.containerEl)
            .setName('Index tag')
            .setDesc("Tag to use in a note's metadata to indicate that it is an index note.")
            .addText(text => text
                .setValue(this.plugin.settings.index_tag)
                .onChange(async (value) => {
                    try {
                        this.plugin.settings.index_tag = value;
                        await this.plugin.saveSettings();
                    } catch (error) {
                        console.error("Failed to save index tag setting:", error);
                    }
                }));
    }

    add_meta_index_tag_setting() {
        new Setting(this.containerEl)
            .setName('Meta index tag')
            .setDesc("Tag to use in a note's metadata to indicate that it is a meta index note (an index of indices).")
            .addText(text => text
                .setValue(this.plugin.settings.meta_index_tag)
                .onChange(async (value) => {
                    try {
                        this.plugin.settings.meta_index_tag = value;
                        await this.plugin.saveSettings();
                    } catch (error) {
                        console.error("Failed to save meta index tag setting:", error);
                    }
                }));
    }

    add_priority_tag_setting() {
        new Setting(this.containerEl)
            .setName('Priority tag')
            .setDesc("Tag to use for pushing a note to the top of an index subsection.")
            .addText(text => text
                .setValue(this.plugin.settings.priority_tag)
                .onChange(async (value) => {
                    try {
                        this.plugin.settings.priority_tag = value;
                        await this.plugin.saveSettings();
                    } catch (error) {
                        console.error("Failed to save priority tag setting:", error);
                    }
                }));
    }

    add_update_interval_setting() {
        new Setting(this.containerEl)
            .setName('Update interval (in seconds)')
            .setDesc("How often to scan the vault and update indices.")
            .addSlider(slider => slider
                .setLimits(1, 30, 1)
                .setValue(this.plugin.settings.update_interval_seconds)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    try {
                        this.plugin.settings.update_interval_seconds = value;
                        await this.plugin.saveSettings();
                        this.plugin.reset_update_interval();
                    } catch (error) {
                        console.error("Failed to save update interval setting:", error);
                    }
                }))
    }

    add_show_note_title() {
        new Setting(this.containerEl)
            .setName('Show title property in index')
            .setDesc("If an entry named 'title' is found in the frontmatter, show it in the index next to the link.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.show_note_title)
                .onChange(async (value) => {
                    try {
                        this.plugin.settings.show_note_title = value;
                        await this.plugin.saveSettings();
                    } catch (error) {
                        console.error("Failed to save show note title setting:", error);
                    }
                }));
    }

    add_exclude_folders_setting() {
        new Setting(this.containerEl).setName("Add excluded folder").setHeading();

        this.plugin.settings.exclude_folders.forEach((template, index) => {
            const s = new Setting(this.containerEl)
                .addSearch((cb) => {
                    // @ts-ignore
                    new FolderSuggest(this.plugin.app, cb.inputEl);
                    cb.setPlaceholder("Example: folder1/template_file")
                        .setValue(template)
                        .onChange((new_template) => {
                            try {
                                if (new_template && this.plugin.settings.exclude_folders.includes(new_template)) {
                                    new Notice("Folder is already excluded");
                                    cb.setValue("");
                                } else {
                                    this.plugin.settings.exclude_folders[index] = new_template;
                                    this.plugin.saveSettings();
                                }
                            } catch (error) {
                                console.error("Failed to update excluded folders setting:", error);
                            }
                        });
                    // @ts-ignore
                    cb.containerEl.addClass("index-notes-search");
                })
                .addExtraButton((cb) => {
                    cb.setIcon("cross")
                        .setTooltip("Delete")
                        .onClick(() => {
                            try {
                                this.plugin.settings.exclude_folders.splice(index, 1);
                                this.plugin.saveSettings();
                                // Force refresh
                                this.display();
                            } catch (error) {
                                console.error("Failed to delete excluded folder setting:", error);
                            }
                        });
                });
            s.infoEl.remove();
        });

        new Setting(this.containerEl).addButton((cb) => {
            cb.setButtonText("Add excluded folder")
                .setCta()
                .onClick(() => {
                    try {
                        this.plugin.settings.exclude_folders.push("");
                        this.plugin.saveSettings();
                        // Force refresh
                        this.display();
                    } catch (error) {
                        console.error("Failed to add excluded folder setting:", error);
                    }
                });
        });
    }

    add_metadata_template() {
        new Setting(this.containerEl)
            .setName("Metadata template")
            .setDesc("Template for new notes")
            .addTextArea((cb) => {
                cb.setValue(this.plugin.settings.metadata_template)
                    .onChange(async (value) => {
                        try {
                            parseYaml(value.replace(/{{/g, '"{{').replace(/}}/g, '}}"'));
                            cb.inputEl.removeClass("index-notes-metadata-template-error");
                            this.plugin.settings.metadata_template = value;
                            await this.plugin.saveSettings();
                        } catch (YAMLParseError) {
                            cb.inputEl.addClass("index-notes-metadata-template-error");
                        }
                    });
                cb.inputEl.addClass("index-notes-metadata-template")
            })
    }
}
