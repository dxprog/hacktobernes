import { Cart } from "../cart/cart";
import { Bus } from "./bus";
import { Wram } from "./wram";

// wram gets mirrored a whole bunch and sits at the beginning of memory
const WRAM_ADDRESS_MASK = 0x1fff;
// anything with bit fifteen set is cart
const CART_ADDRESS_MASK = 0x8000;

export class System {
  private bus: Bus;
  private cart: Cart;
  private wram: Wram;

  constructor(cart: Cart) {
    this.bus = new Bus();
    this.wram = new Wram();
    this.cart = cart;

    this.buildMemoryMap();
  }

  private buildMemoryMap() {
    // wram: 0x0000-0x1FFF
    this.bus.attachChip(WRAM_ADDRESS_MASK, this.wram, true);
    // cart: 0x8000-0xFFFF
    this.bus.attachChip(CART_ADDRESS_MASK, this.cart);

    this.bus.setAddr(0);
    this.bus.setBusDirection('write');
    this.bus.setBusValue(45);
    this.bus.setBusDirection('read');
    console.log(this.bus.getBusValue());
    this.bus.setAddr(0xFFFC);
    console.log(this.bus.getBusValue());
    this.bus.setAddr(0xFFFD);
    console.log(this.bus.getBusValue());
  }
}
