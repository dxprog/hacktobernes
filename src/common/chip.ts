import { Bus } from '../system/bus';

export class Chip {
  protected bus: Bus;

  public read(address: number): number {
    throw new Error('read method not implemented');
  }

  public write(address: number, value: number) {
    throw new Error('write method not implemented');
  }

  public setBus(bus: Bus) {
    this.bus = bus;
  }
}
