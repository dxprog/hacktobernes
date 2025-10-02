type LoadedCallback = (encodedRomData: string) => void;

export class CartUploader {
  private attachedEl: HTMLElement;
  private uiEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private loadedCallback: LoadedCallback;

  constructor(el: HTMLElement, loadedCallback: LoadedCallback) {
    this.attachedEl = el;
    this.loadedCallback = loadedCallback;
    this.buildUI();
  }

  private createDomFragment<T extends HTMLElement>(
    elementName: keyof HTMLElementTagNameMap,
    attributes: Record<string, string>,
    innerText: string = ''
  ) {
    const el = document.createElement(elementName);
    Object.keys(attributes).forEach(key => el.setAttribute(key, attributes[key]));
    el.innerText = innerText;
    return el as T;
  }

  handleUploadClick() {
    const fileReader = new FileReader();
    fileReader.onloadend = () => {
      // todo: validate the rom data, probably pass it in as a Cart object
      this.loadedCallback(fileReader.result as unknown as string);
    };
    fileReader.readAsDataURL(this.inputEl.files[0]);
  }

  buildUI() {
    this.uiEl = this.createDomFragment('div', { id: 'upload-cart' });
    this.uiEl.appendChild(
      this.createDomFragment('label', { for: 'file-uploader' }, 'NES ROM')
    );
    this.inputEl = this.createDomFragment<HTMLInputElement>('input', {
      type: 'file',
      name: 'file-uploader',
    });
    this.uiEl.appendChild(this.inputEl);
    const submitButton = this.createDomFragment('button', {}, 'Upload');
    submitButton.addEventListener('click', () => this.handleUploadClick());
    this.uiEl.appendChild(submitButton);
  }

  show() {
    this.attachedEl.appendChild(this.uiEl);
  }

  hide() {
    this.attachedEl.removeChild(this.uiEl);
  }
}
