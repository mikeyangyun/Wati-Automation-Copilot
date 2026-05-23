import { nanoid } from 'nanoid';

const ID_BODY_LENGTH = 10;

const prefixed = (prefix: string) => (): string => `${prefix}${nanoid(ID_BODY_LENGTH)}`;

export const newFlowId = prefixed('flow_');
export const newNodeId = prefixed('node_');
export const newEdgeId = prefixed('edge_');
export const newSessionId = prefixed('sess_');
export const newMessageId = prefixed('msg_');
export const newIssueId = prefixed('iss_');
