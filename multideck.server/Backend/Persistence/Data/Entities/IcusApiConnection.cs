using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class IcusApiConnection
{
    public Guid IcuscId { get; set; }

    public Guid? IcuscOrgOfficeId { get; set; }

    public string IcuscName { get; set; } = null!;

    public string? IcuscJurisdictionCode { get; set; }

    public string IcuscEnvironment { get; set; } = null!;

    public string? IcuscBaseUrl { get; set; }

    public string IcuscAuthType { get; set; } = null!;

    public string? IcuscClientId { get; set; }

    public string? IcuscSecretRef { get; set; }

    public string? IcuscWebhookSecretRef { get; set; }

    public bool IcuscDefaultForOffice { get; set; }

    public bool IcuscIsActive { get; set; }

    public string IcuscSettingsJson { get; set; } = null!;

    public DateTime IcuscCreatedAt { get; set; }

    public Guid? IcuscCreatedBy { get; set; }

    public DateTime IcuscUpdatedAt { get; set; }

    public Guid? IcuscUpdatedBy { get; set; }

    public virtual ICollection<IcusSubmission> IcusSubmissions { get; set; } = new List<IcusSubmission>();

    public virtual ICollection<IcusWebhookEvent> IcusWebhookEvents { get; set; } = new List<IcusWebhookEvent>();

    public virtual SysICustomsEnvironment IcuscEnvironmentNavigation { get; set; } = null!;

    public virtual SysCustomsJurisdiction? IcuscJurisdictionCodeNavigation { get; set; }
}
