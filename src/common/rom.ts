import { Chip } from './chip';

export class Rom extends Chip {
  private romData: Uint8Array;
  private addressMask: number;

  constructor(romData: Uint8Array, addressMask: number) {
    super();
    this.romData = romData;
    this.addressMask = addressMask;
  }

  read(address: number): number {
    return this.romData[address & this.addressMask];
  }

  write(address: number, value: number) {
    // ROM is read only :)
  }
}
