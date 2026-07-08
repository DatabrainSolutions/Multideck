using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CustomsVersion
{
    public Guid CustvnId { get; set; }

    public Guid CustvnCustomsId { get; set; }

    public int CustvnVersionNumber { get; set; }

    public string? CustvnStatus { get; set; }

    public string? CustvnChangeReason { get; set; }

    public string CustvnSnapshot { get; set; } = null!;

    public DateTime CustvnCreatedAt { get; set; }

    public Guid? CustvnCreatedBy { get; set; }

    public virtual CustomsDeclaration CustvnCustoms { get; set; } = null!;

    public virtual SysCustomsDeclarationStatus? CustvnStatusNavigation { get; set; }
}
