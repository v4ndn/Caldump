import DateSelector from "dateSelector";
import getTasks, { Task } from "icalUtils";
import moment from "moment";
import {
  App,
  ButtonComponent,
  Editor,
  getIcon,
  getIconIds,
  IconValue,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  SuggestModal,
  TextAreaComponent,
  TextComponent,
} from "obsidian";

// Remember to rename these classes and interfaces!

interface Settings {
  iCalUrls: { name: string; url: string }[];
  formatting: string;
}

const DEFAULT_SETTINGS: Settings = {
  iCalUrls: [],
  formatting: "${summary} - ${dueDate}",
};

export default class ICalDump extends Plugin {
  settings: Settings;

  async addIcalCommand(index: number, cal: { name: string; url: string }) {
    this.addCommand({
      id: "dump-ical-" + index,
      name: "Dump " + (cal.name || "#" + (index + 1)) + " calendar today tasks",
      editorCallback: async (editor: Editor, _view: MarkdownView) => {
        const today = moment();

        new Notice("Getting tasks from " + cal.name);

        const tasks = await getTasks(
          this.settings.iCalUrls[index].url,
          `${today.format("DD.MM.YYYY")}`
        );

        new Notice("Done!");

        editor.replaceSelection(
          tasks.reduce((acc, el, i) => {
            return acc + this.format(this.settings.formatting, el);
          }, "")
        );
      },
    });

    this.addCommand({
      id: "dump-ical-" + index + "-date",
      name:
        "Dump " + (cal.name || "#" + (index + 1)) + " calendar tasks from date",
      editorCallback: async (editor: Editor, _view: MarkdownView) => {
        new Notice("Getting tasks from " + cal.name);
        const dateSelector = new DateSelector(this);

        const date = moment(
          (await dateSelector.openAndGetResult()).split(" -")[0],
          "DD.MM.YYYY"
        );

        const tasks = await getTasks(
          this.settings.iCalUrls[index].url,
          `${date.format("DD.MM.YYYY")}`
        );

        new Notice("Done!");

        editor.replaceSelection(
          tasks.reduce((acc, el, i) => {
            return acc + this.format(this.settings.formatting, el);
          }, "")
        );
      },
    });
  }

  async onload() {
    await this.loadSettings();
    this.settings.iCalUrls.forEach((cal, i) => {
      this.addIcalCommand(i, cal);
    });

    this.addSettingTab(new SettingsTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  format(input: string, task: Task): string {
    return input
      .replaceAll("${summary}", task.summary)

      .replaceAll("${startMinute}", moment(task.startDate).format("mm"))
      .replaceAll("${startHour}", moment(task.startDate).format("HH"))
      .replaceAll("${startSecond}", moment(task.startDate).format("SS"))

      .replaceAll("${endMinute}", moment(task.endDate).format("mm"))
      .replaceAll("${endHour}", moment(task.endDate).format("HH"))
      .replaceAll("${endSecond}", moment(task.endDate).format("SS"))

      .replaceAll(
        "${duration}",
        (moment(task.endDate).diff(task.startDate) / 1000 / 60).toString()
      )

      .replaceAll("${status}", task.status)
      .replaceAll("${description}", task.description || "")
      .replaceAll("${isRecurring}", task.isRecurring.toString())
      .replaceAll("${type}", task.type);
  }
}

class SettingsTab extends PluginSettingTab {
  plugin: ICalDump;

  constructor(app: App, plugin: ICalDump) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    this.plugin.settings.iCalUrls.forEach((_, i) => {
      new Setting(containerEl)
        .setName("ICal url #" + (i + 1))
        .setDesc("Put our URL path to ICal file")
        .addText((text) =>
          text
            .setValue(this.plugin.settings.iCalUrls[i].name)
            .setPlaceholder("Calendar name")
            .onChange(async (value) => {
              this.plugin.settings.iCalUrls[i].name = value;
              this.plugin.removeCommand("dump-ical-" + i);
              this.plugin.removeCommand("dump-ical-" + i + "-date");
              this.plugin.addIcalCommand(i, this.plugin.settings.iCalUrls[i]);
              await this.plugin.saveSettings();
            })
        )
        .addText((text) =>
          text
            .setValue(this.plugin.settings.iCalUrls[i].url)
            .setPlaceholder("ICal file url")
            .onChange(async (value) => {
              this.plugin.settings.iCalUrls[i].url = value;
              await this.plugin.saveSettings();
            })
        )
        .addButton((buttonComponent) => {
          buttonComponent.setIcon("trash-2").onClick(async () => {
            this.plugin.settings.iCalUrls.splice(i, 1);
            await this.plugin.saveSettings();
            this.display();
          });
        });
    });

    new Setting(containerEl)
      .setName("Add calendar file")
      .addButton((button) => {
        button.setButtonText("Add URL").onClick(async () => {
          this.plugin.settings.iCalUrls.push({ name: "", url: "" });
          await this.plugin.saveSettings();
          this.display();
        });
      });

    new Setting(containerEl).setName("Formatting").addTextArea((area) => {
      area
        .setPlaceholder(
          "Available placeholders: summary, startMinute, startHour, startSecond, endMinute, endHour, endSecond, status, description, isRecurring, type\n All placeholders should be surrounded by written as '${summary}' for example"
        )
        .setValue(this.plugin.settings.formatting)
        .onChange(async (e) => {
          this.plugin.settings.formatting = e;
          await this.plugin.saveSettings();
        });
    });
  }
}
