using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTceclassificationStatus
{
    public string TceclassStatusCode { get; set; } = null!;

    public string TceclassStatusName { get; set; } = null!;

    public string? TceclassStatusDescription { get; set; }

    public bool TceclassStatusIsFinal { get; set; }

    public bool TceclassStatusIsActive { get; set; }

    public int TceclassStatusSortOrder { get; set; }

    public virtual ICollection<TceHsclassification> TceHsclassifications { get; set; } = new List<TceHsclassification>();
}
