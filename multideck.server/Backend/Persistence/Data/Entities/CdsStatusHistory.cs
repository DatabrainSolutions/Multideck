using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsStatusHistory
{
    public Guid CdsshId { get; set; }

    public Guid CdsshCdsid { get; set; }

    public string? CdsshFromStatus { get; set; }

    public string CdsshToStatus { get; set; } = null!;

    public DateTime CdsshChangedAt { get; set; }

    public Guid? CdsshChangedBy { get; set; }

    public string? CdsshReason { get; set; }

    public string? CdsshSource { get; set; }

    public virtual CdsDeclaration CdsshCds { get; set; } = null!;

    public virtual SysCustomsDeclarationStatus? CdsshFromStatusNavigation { get; set; }

    public virtual SysCustomsDeclarationStatus CdsshToStatusNavigation { get; set; } = null!;
}
