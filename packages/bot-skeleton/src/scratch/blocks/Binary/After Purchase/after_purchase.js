import { localize } from '@deriv/translations';
import { finishSign } from '../../images';
import { setBlockTextColor } from '../../../utils';

Blockly.Blocks.after_purchase = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('%1 4. Restart trading conditions %2'),
            message1: '%1',
            args0: [
                {
                    type: 'field_image',
                    src: finishSign,
                    width: 25,
                    height: 25,
                    alt: 'F',
                },
                {
                    type: 'input_dummy',
                },
            ],
            args1: [
                {
                    type: 'input_statement',
                    name: 'AFTERPURCHASE_STACK',
                    check: 'TradeAgain',
                },
            ],
            colour: Blockly.Colours.RootBlock.colour,
            colourSecondary: Blockly.Colours.RootBlock.colourSecondary,
            colourTertiary: Blockly.Colours.RootBlock.colourTertiary,
            tooltip: localize('Get the last trade information and result, then trade again.'),
            category: Blockly.Categories.After_Purchase,
        };
    },
    meta() {
        return {
            display_name: localize('Restart trading conditions'),
            description: localize('Here is where you can decide if your bot should continue trading.'),
        };
    },
    onchange(event) {
        setBlockTextColor(this, event);
    },
};

Blockly.JavaScript.after_purchase = block => {
    const stack = Blockly.JavaScript.statementToCode(block, 'AFTERPURCHASE_STACK');
    const code = `
    BinaryBotPrivateAfterPurchase = function BinaryBotPrivateAfterPurchase() {
        ${stack}
        Bot.isTradeAgain(false);
        return false;
    };`;
    return [code, Blockly.JavaScript.ORDER_ATOMIC];
};
