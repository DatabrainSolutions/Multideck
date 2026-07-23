using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CustomsStatusHistory
{
    public Guid CustshId { get; set; }

    public Guid CustshCustomsId { get; set; }

    public string? CustshFromStatus { get; set; }

    public string CustshToStatus { get; set; } = null!;

    public DateTime CustshChangedAt { get; set; }

    public Guid? CustshChangedBy { get; set; }

    public string? CustshReason { get; set; }

    public string? CustshSource { get; set; }

    public virtual CustomsDeclaration CustshCustoms { get; set; } = null!;

    public virtual SysCustomsDeclarationStatus? CustshFromStatusNavigation { get; set; }

    public virtual SysCustomsDeclarationStatus CustshToStatusNavigation { get; set; } = null!;
}
