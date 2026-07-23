using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecCredentialReference
{
    public Guid SeccredId { get; set; }

    public string SeccredCode { get; set; } = null!;

    public string SeccredName { get; set; } = null!;

    public string SeccredCredentialTypeCode { get; set; } = null!;

    public string SeccredStatusCode { get; set; } = null!;

    public string? SeccredModuleCode { get; set; }

    public string? SeccredProviderCode { get; set; }

    public Guid? SeccredOrgOfficeId { get; set; }

    public string SeccredVaultProvider { get; set; } = null!;

    public string SeccredVaultPathRef { get; set; } = null!;

    public string? SeccredSecretVersionRef { get; set; }

    public string? SeccredPublicFingerprint { get; set; }

    public DateTime? SeccredExpiresAt { get; set; }

    public DateTime? SeccredRotationDueAt { get; set; }

    public Guid? SeccredOwnerUserId { get; set; }

    public string? SeccredDescription { get; set; }

    public DateTime SeccredCreatedAt { get; set; }

    public Guid? SeccredCreatedBy { get; set; }

    public virtual ICollection<ObsWebhookInbox> ObsWebhookInboxes { get; set; } = new List<ObsWebhookInbox>();

    public virtual ICollection<SecCredentialGrant> SecCredentialGrants { get; set; } = new List<SecCredentialGrant>();

    public virtual ICollection<SecCredentialRotationEvent> SecCredentialRotationEvents { get; set; } = new List<SecCredentialRotationEvent>();

    public virtual CmpUser? SeccredCreatedByNavigation { get; set; }

    public virtual SysSeccredentialType SeccredCredentialTypeCodeNavigation { get; set; } = null!;

    public virtual SysSubmoduleCode? SeccredModuleCodeNavigation { get; set; }

    public virtual CmpOffice? SeccredOrgOffice { get; set; }

    public virtual CmpUser? SeccredOwnerUser { get; set; }

    public virtual SysSeccredentialStatus SeccredStatusCodeNavigation { get; set; } = null!;
}
