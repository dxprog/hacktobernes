import { CartUploader } from './uploader';
import { Cart } from './cart';

const ROM_STORAGE_KEY = 'current-rom';

export class CartLoader {
  private parentEl: HTMLElement;
  private uploader: CartUploader;

  constructor(parentEl) {
    this.parentEl = parentEl;
    this.uploader = new CartUploader(parentEl, this.handleRomUploaded.bind(this));

    if (!this.hasSavedRom()) {
      this.uploader.show();
    } else {
      this.loadRomData(window.localStorage.getItem(ROM_STORAGE_KEY));
    }
  }

  handleRomUploaded(encodedRomData: string) {
    window.localStorage.setItem(ROM_STORAGE_KEY, encodedRomData);
    this.loadRomData(encodedRomData);
  }

  async loadRomData(encodedRomData: string) {
    const cart = new Cart();
    await cart.loadEncodedRom(encodedRomData);
  }

  hasSavedRom(): boolean {
    const romData = window.localStorage.getItem(ROM_STORAGE_KEY);
    // TODO: validate that any rom data is actually a rom
    return !!romData;
  }
};
