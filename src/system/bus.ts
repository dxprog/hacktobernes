import { Chip } from "../common/chip";

type ChipSelect = {
  addressMask: number;
  chip: Chip;
  startOfMemoryMap: boolean;
}

type BusDirection = 'read' | 'write';

const BYTE_MAX = 0xff;

export class Bus {
  private addressChipMap: ChipSelect[] = [];
  private address: number;
  private value: number;
  private direction: BusDirection = 'read';

  constructor() {
    this.value = this.getFloatingValue();
  }

  attachChip(addressMask: number, chip: Chip, startOfMemoryMap: boolean = false) {
    this.addressChipMap.push({
      addressMask, chip, startOfMemoryMap
    });
  }

  setBusDirection(busDirection: BusDirection) {
    if (this.direction !== busDirection) {
      this.direction = busDirection;

      // if the direction is read, populate the value with whatever's at that addy
      // maybe at some point I'll implement the 74ls139/clock2 logic for proper timing...
      if (this.direction === 'read') {
        this.readValueAtAddress();
      } else {
        this.writeValueToAddress();
      }
    }
  }

  /**
   * Used by CPU to drive the bus address
   *
   * @param address The address to set
   */
  setAddr(address: number) {
    if (this.address !== address) {
      this.address = address;

      // if the bus is reading, read whatever's at that address
      if (this.direction === 'read') {
        this.readValueAtAddress();
      } else {
        this.writeValueToAddress();
      }
    }
  }

  private isInRange(chipSelect: ChipSelect) {
    return (
      (this.address & chipSelect.addressMask) > 0 ||
      this.address === 0 && chipSelect.startOfMemoryMap
    );
  }

  private readValueAtAddress() {
    let value = this.getFloatingValue();
    this.addressChipMap.forEach(chipSelect => {
      if (this.isInRange(chipSelect)) {
        value = chipSelect.chip.read(this.address);
      }
    });
    this.value = value;
  }

  private writeValueToAddress() {
    this.addressChipMap.forEach(chipSelect => {
      if (this.isInRange(chipSelect)) {
        chipSelect.chip.write(this.address, this.value);
      }
    });
  }

  getBusValue() {
    return this.value;
  }

  setBusValue(value: number) {
    this.value = value & BYTE_MAX;
    if (this.direction === 'write') {
      this.writeValueToAddress();
    }
  }

  private getFloatingValue() {
    return Math.floor(Math.random() * 256);
  }
}
