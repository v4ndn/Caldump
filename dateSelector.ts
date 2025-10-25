import ICalDump from "main";
import moment from "moment";
import { SuggestModal } from "obsidian";

export default class DateSelector extends SuggestModal<string> {
  resolve: ((value: string | PromiseLike<string> | undefined) => void) | null =
    null;
  constructor(private readonly plugin: ICalDump) {
    super(plugin.app);
    this.setPlaceholder("Enter your date in DD.MM.YYYY format.");
  }

  openAndGetResult(): Promise<string> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  onClose() {
    // onClose gets called before onChooseItem
    void new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
      if (this.resolve) this.resolve(undefined);
    });
  }

  getSuggestions(query: string): string[] {
    return [
      moment(query, "DD.MM.YYYY").format("DD.MM.YYYY"),
      moment().subtract(1, "d").format("DD.MM.YYYY") + " - Yesterday",
      moment().add(1, "d").format("DD.MM.YYYY") + " - Tomorrow",
      moment().add(1, "w").format("DD.MM.YYYY") + " - In 1 week",
      moment().format("DD.MM.YYYY") + " - Today",
    ];
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.innerText = value;
  }

  onChooseSuggestion(value: string, __: MouseEvent | KeyboardEvent) {
    if (this.resolve) this.resolve(value);
  }
}
