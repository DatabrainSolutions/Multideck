using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlStatusHistory
{
    public Guid BlshId { get; set; }

    public Guid BlshBlId { get; set; }

    public string? BlshFromStatus { get; set; }

    public string BlshToStatus { get; set; } = null!;

    public string? BlshReason { get; set; }

    public DateTime BlshChangedAt { get; set; }

    public Guid? BlshChangedBy { get; set; }

    public virtual BlHeader BlshBl { get; set; } = null!;

    public virtual SysBldocumentStatus? BlshFromStatusNavigation { get; set; }

    public virtual SysBldocumentStatus BlshToStatusNavigation { get; set; } = null!;
}
