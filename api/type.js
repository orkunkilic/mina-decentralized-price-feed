const { Field, Struct, UInt64, Poseidon } = require("snarkyjs");

class Price extends Struct({
    token: Field,
    price: Field,
    timestamp: UInt64,
}) {
    static hash(p) {
        return Poseidon.hash(Price.toFields(p));
    }
}

module.exports = Price;