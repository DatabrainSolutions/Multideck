using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiServiceProvider
{
    public Guid EdispId { get; set; }

    public string EdispCode { get; set; } = null!;

    public string EdispName { get; set; } = null!;

    public string EdispServiceTypeCode { get; set; } = null!;

    public bool EdispIsManagedEdiprovider { get; set; }

    public bool EdispIsVan { get; set; }

    public string? EdispApibaseUrl { get; set; }

    public string? EdispSupportContact { get; set; }

    public string EdispSettingsJson { get; set; } = null!;

    public bool EdispIsActive { get; set; }

    public DateTime EdispCreatedAt { get; set; }

    public Guid? EdispCreatedBy { get; set; }

    public virtual ICollection<EdiConnection> EdiConnections { get; set; } = new List<EdiConnection>();

    public virtual ICollection<EdiWebhookEvent> EdiWebhookEvents { get; set; } = new List<EdiWebhookEvent>();

    public virtual CmpUser? EdispCreatedByNavigation { get; set; }

    public virtual SysEditransportMethod EdispServiceTypeCodeNavigation { get; set; } = null!;
}
