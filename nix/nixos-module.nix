{ config, lib, pkgs, ... }:

with lib;

let
  cfg = config.services.johnny-blog-datagraph;
in
{
  options.services.johnny-blog-datagraph = {
    enable = mkEnableOption "Johnny Blog Datagraph service";
    
    port = mkOption {
      type = types.port;
      default = 3007;
      description = "Port to run the datagraph API on";
    };
    
    frontendUrl = mkOption {
      type = types.str;
      default = "http://localhost:3000";
      description = "Frontend URL for CORS configuration";
    };
    
    agePrivateKey = mkOption {
      type = types.str;
      description = "Age private key for decryption (from age.secrets)";
    };
    
    agePublicKey = mkOption {
      type = types.str;
      description = "Age public key for encryption";
    };
    
    dataDir = mkOption {
      type = types.path;
      default = "/var/lib/johnny-blog-dg";
      description = "Directory to store datagraph data";
    };
    
    user = mkOption {
      type = types.str;
      default = "datagraph";
      description = "User to run the datagraph service";
    };
    
    group = mkOption {
      type = types.str;
      default = "datagraph";
      description = "Group to run the datagraph service";
    };
  };

  config = mkIf cfg.enable {
    # Create user and group
    users.users.${cfg.user} = {
      isSystemUser = true;
      group = cfg.group;
      home = cfg.dataDir;
      createHome = true;
    };
    
    users.groups.${cfg.group} = {};

    # Systemd service
    systemd.services.johnny-blog-datagraph = {
      description = "Johnny Blog Datagraph API";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];
      
      environment = {
        AGE_PRIVATE_KEY = cfg.agePrivateKey;
        AGE_PUBLIC_KEY = cfg.agePublicKey;
        DATAGRAPH_PORT = toString cfg.port;
        FRONTEND_URL = cfg.frontendUrl;
        NODE_ENV = "production";
      };
      
      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Group = cfg.group;
        WorkingDirectory = cfg.dataDir;
        ExecStart = "${pkgs.johnny-blog-datagraph}/bin/johnny-blog-dg-service";
        Restart = "always";
        RestartSec = "10";
        
        # Security settings
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        ReadWritePaths = [ cfg.dataDir ];
        PrivateDevices = true;
        ProtectKernelTunables = true;
        ProtectKernelModules = true;
        ProtectControlGroups = true;
        
        # Resource limits
        LimitNOFILE = 65536;
        LimitNPROC = 4096;
      };
      
      preStart = ''
        # Ensure data directory exists and has correct permissions
        mkdir -p ${cfg.dataDir}/{data,metadata,temp}
        chown -R ${cfg.user}:${cfg.group} ${cfg.dataDir}
        chmod -R 755 ${cfg.dataDir}
      '';
    };

    # Firewall configuration
    networking.firewall.allowedTCPPorts = [ cfg.port ];

    # Health check endpoint
    systemd.timers.johnny-blog-dg-health = {
      description = "Health check for Johnny Blog Datagraph";
      wantedBy = [ "timers.target" ];
      timerConfig = {
        OnBootSec = "1min";
        OnUnitActiveSec = "5min";
      };
    };
    
    systemd.services.johnny-blog-dg-health = {
      description = "Health check for Johnny Blog Datagraph";
      serviceConfig = {
        Type = "oneshot";
        User = "nobody";
        ExecStart = "${pkgs.curl}/bin/curl -f http://localhost:${toString cfg.port}/health";
      };
    };

    # Logging configuration
    services.journald.extraConfig = ''
      # Increase log retention for datagraph
      MaxRetentionSec=1month
      MaxFileSec=1week
    '';

    # Monitoring
    services.prometheus.exporters.node.enabled = true;
    
    # Backup configuration
    services.johnny-blog-dg-backup = {
      description = "Backup datagraph to GitHub";
      wantedBy = [ "multi-user.target" ];
      after = [ "johnny-blog-datagraph.service" ];
      
      serviceConfig = {
        Type = "oneshot";
        User = cfg.user;
        Group = cfg.group;
        WorkingDirectory = cfg.dataDir;
        ExecStart = "${pkgs.johnny-blog-datagraph}/bin/johnny-blog-dg-backup";
      };
    };
    
    systemd.timers.johnny-blog-dg-backup = {
      description = "Backup datagraph to GitHub";
      wantedBy = [ "timers.target" ];
      timerConfig = {
        OnBootSec = "5min";
        OnUnitActiveSec = "1h";
      };
    };
  };
}


