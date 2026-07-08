using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class T1Version
{
    public Guid T1vnId { get; set; }

    public Guid T1vnT1id { get; set; }

    public int T1vnVersionNumber { get; set; }

    public string? T1vnStatus { get; set; }

    public string? T1vnChangeReason { get; set; }

    public string T1vnSnapshot { get; set; } = null!;

    public DateTime T1vnCreatedAt { get; set; }

    public Guid? T1vnCreatedBy { get; set; }

    public virtual SysCustomsDeclarationStatus? T1vnStatusNavigation { get; set; }

    public virtual T1Declaration T1vnT1 { get; set; } = null!;
}
