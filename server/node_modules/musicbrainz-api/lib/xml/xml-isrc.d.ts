export declare class XmlIsrc {
    isrc: string;
    constructor(isrc: string);
    toXml(): {
        name: string;
        attrs: {
            id: string;
        };
    };
}
