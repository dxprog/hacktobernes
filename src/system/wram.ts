import { Chip } from '../common/chip';

const WRAM_SIZE = 0x800; // 2k
// this will take care of the mirroring from 0000-1FFF
const ADDRESS_MASK = 0x7ff;

export class Wram extends Chip {
  private ram: number[];
  private debug: boolean;

  constructor(debug: boolean = false) {
    super();

    // zero out the ram. maybe someday I'll fill it with a starting pattern
    // like an actual ram chip...
    this.ram = new Array(WRAM_SIZE).fill(0);
    this.debug = debug;
  }

  read(address: number) {
    const value = this.ram[address & ADDRESS_MASK];
    if (this.debug) {
      console.log('RAM read: $', address.toString(16), value.toString(16));
    }
    return value;
  }

  write(address: number, value: number) {
    if (this.debug) {
      console.log('RAM write: $', address.toString(16), value.toString(16));
    }
    this.ram[address & ADDRESS_MASK] = value;
  }
}
