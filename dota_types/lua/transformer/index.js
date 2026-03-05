"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var ts = require("typescript");
// eslint-disable-next-line @typescript-eslint/no-require-imports
var mappings = require('./mappings.json');
function getMapping(name) {
    if (Object.prototype.hasOwnProperty.call(mappings, name)) {
        return mappings[name];
    }
}
var replaceNode = function (node) {
    // Would be handled as a part of main process of const enum transform
    if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node))
        return;
    var expression = node.expression;
    if (!ts.isIdentifier(expression))
        return;
    var enumMembers = getMapping(expression.text);
    if (!enumMembers)
        return;
    var nameText;
    if (ts.isPropertyAccessExpression(node)) {
        nameText = node.name.text;
    }
    else if (ts.isElementAccessExpression(node)) {
        if (!ts.isStringLiteral(node.argumentExpression)) {
            return;
        }
        nameText = node.argumentExpression.text;
    }
    else {
        return;
    }
    if (Object.prototype.hasOwnProperty.call(enumMembers, nameText)) {
        return ts.factory.createIdentifier(enumMembers[nameText]);
    }
};
var createDotaTransformer = function () { return function (context) {
    var visit = function (node) { return replaceNode(node) || ts.visitEachChild(node, visit, context); };
    return function (file) { return ts.visitEachChild(file, visit, context); };
}; };
exports.default = createDotaTransformer;
