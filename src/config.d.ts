declare type DesktopConfig = {
  firstLaunch: boolean;
  customFrame: boolean;
  minimiseToTray: boolean;
  startMinimisedToTray: boolean; // Ferret mod: was missing, used by the settings page
  spellchecker: boolean;
  hardwareAcceleration: boolean;
  discordRpc: boolean;
  windowState: {
    x: number;
    y: number;
    width: number;
    height: number;
    isMaximised: boolean;
  };
};
