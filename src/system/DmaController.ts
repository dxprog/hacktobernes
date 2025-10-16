import { Bus } from "./bus";

type ClockOperation = 'put' | 'get';

export class DmaController {
  private length: number;
  private value: number;
  private sourceAddr: number;
  private destinationAddr: number;
  private operation: ClockOperation;
  private currentByte: number;
  private bus: Bus;

  constructor(bus: Bus) {
    this.bus = bus;
    this.length = 0;
    this.currentByte = 0;
  }

  beginDmaTransfer(sourceAddr: number, destinationAddr: number, length: number) {
    this.currentByte = 0;
    this.operation = 'get';
    this.length = length;
    this.sourceAddr = sourceAddr;
    this.destinationAddr = destinationAddr;
  }

  clock(): boolean {
    // if we've transferred all the bytes, return that nothing was done
    if (this.length === this.currentByte) {
      return false;
    }

    this.operation = this.operation === 'get' ? 'put' : 'get';
    if (this.operation === 'get') {
      this.value = this.bus.readAddr(this.sourceAddr + this.currentByte);
    } else {
      this.bus.writeAddr(this.destinationAddr, this.value);
      this.currentByte++;
    }

    return true;
  }
}
