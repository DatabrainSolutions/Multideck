using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiConnection
{
    public Guid EdicId { get; set; }

    public Guid? EdicServiceProviderId { get; set; }

    public Guid? EdicTradingPartnerId { get; set; }

    public string EdicName { get; set; } = null!;

    public string EdicTransportMethodCode { get; set; } = null!;

    public string EdicStatusCode { get; set; } = null!;

    public string EdicDirectionCode { get; set; } = null!;

    public Guid? EdicOrgOfficeId { get; set; }

    public Guid? EdicLegalEntityId { get; set; }

    public Guid? EdicBrandId { get; set; }

    public string EdicEnvironment { get; set; } = null!;

    public string? EdicHost { get; set; }

    public int? EdicPort { get; set; }

    public string? EdicBaseUrl { get; set; }

    public string? EdicInboundPath { get; set; }

    public string? EdicOutboundPath { get; set; }

    public string? EdicUsernameRef { get; set; }

    public string? EdicSecretRef { get; set; }

    public string? EdicSshkeyRef { get; set; }

    public string? EdicCertificateRef { get; set; }

    public string? EdicPrivateKeyRef { get; set; }

    public string? EdicAs2fromId { get; set; }

    public string? EdicAs2toId { get; set; }

    public string? EdicWebhookUrl { get; set; }

    public string? EdicWebhookSecretRef { get; set; }

    public int EdicPollIntervalMinutes { get; set; }

    public string EdicSettingsJson { get; set; } = null!;

    public DateTime? EdicLastTestAt { get; set; }

    public DateTime? EdicLastSuccessAt { get; set; }

    public string? EdicLastErrorText { get; set; }

    public DateTime EdicCreatedAt { get; set; }

    public Guid? EdicCreatedBy { get; set; }

    public DateTime EdicUpdatedAt { get; set; }

    public Guid? EdicUpdatedBy { get; set; }

    public virtual ICollection<EdiBatch> EdiBatches { get; set; } = new List<EdiBatch>();

    public virtual ICollection<EdiInboundQueue> EdiInboundQueues { get; set; } = new List<EdiInboundQueue>();

    public virtual ICollection<EdiMessageProfile> EdiMessageProfiles { get; set; } = new List<EdiMessageProfile>();

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();

    public virtual ICollection<EdiOutboundQueue> EdiOutboundQueues { get; set; } = new List<EdiOutboundQueue>();

    public virtual ICollection<EdiWebhookEvent> EdiWebhookEvents { get; set; } = new List<EdiWebhookEvent>();

    public virtual CmpBrand? EdicBrand { get; set; }

    public virtual CmpUser? EdicCreatedByNavigation { get; set; }

    public virtual SysEdidirection EdicDirectionCodeNavigation { get; set; } = null!;

    public virtual CmpLegalEntity? EdicLegalEntity { get; set; }

    public virtual CmpOffice? EdicOrgOffice { get; set; }

    public virtual EdiServiceProvider? EdicServiceProvider { get; set; }

    public virtual SysEdiconnectionStatus EdicStatusCodeNavigation { get; set; } = null!;

    public virtual EdiTradingPartner? EdicTradingPartner { get; set; }

    public virtual SysEditransportMethod EdicTransportMethodCodeNavigation { get; set; } = null!;

    public virtual CmpUser? EdicUpdatedByNavigation { get; set; }
}
