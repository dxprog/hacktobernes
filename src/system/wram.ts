import { Chip } from '../common/chip';

const WRAM_SIZE = 0x800; // 2k
// this will take care of the mirroring from 0000-1FFF
const ADDRESS_MASK = 0x7ff;

export class Wram extends Chip {
  private ram: number[];

  constructor() {
    super();

    // zero out the ram. maybe someday I'll fill it with a starting pattern
    // like an actual ram chip...
    this.ram = new Array(WRAM_SIZE).fill(0);
  }

  read(address: number) {
    return this.ram[address & ADDRESS_MASK];
  }

  write(address: number, value: number) {
    this.ram[address & ADDRESS_MASK] = value;
  }
}
