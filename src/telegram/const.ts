export const tmaModeDescription: { [key: string]: string } = {
    test: 'Test an email address',
    white: 'Manage the white list',
    block: 'Manage the block list',
};

export const telegramCommands = [
    {
        command: 'start',
        description: 'Initialize and show bot info',
    },
    {
        command: 'send',
        description: 'Compose a brand new email',
    },
    {
        command: 'reply',
        description: '/reply <id> - Reply to an email',
    },
    {
        command: 'forward',
        description: '/forward <id> - Forward an email',
    },
    {
        command: 'inbox',
        description: 'Browse your stored emails',
    },
    {
        command: 'white',
        description: 'Manage the white list (TMA)',
    },
    {
        command: 'block',
        description: 'Manage the block list (TMA)',
    },
    {
        command: 'cancel',
        description: 'Cancel current draft flow',
    },
    {
        command: 'id',
        description: 'Get your chat ID',
    },
];
