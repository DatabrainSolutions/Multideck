using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class T1StatusHistory
{
    public Guid T1shId { get; set; }

    public Guid T1shT1id { get; set; }

    public string? T1shFromStatus { get; set; }

    public string T1shToStatus { get; set; } = null!;

    public DateTime T1shChangedAt { get; set; }

    public Guid? T1shChangedBy { get; set; }

    public string? T1shReason { get; set; }

    public string? T1shSource { get; set; }

    public virtual SysCustomsDeclarationStatus? T1shFromStatusNavigation { get; set; }

    public virtual T1Declaration T1shT1 { get; set; } = null!;

    public virtual SysCustomsDeclarationStatus T1shToStatusNavigation { get; set; } = null!;
}
