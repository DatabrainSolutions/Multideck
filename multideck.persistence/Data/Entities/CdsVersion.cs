using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsVersion
{
    public Guid CdsvnId { get; set; }

    public Guid CdsvnCdsid { get; set; }

    public int CdsvnVersionNumber { get; set; }

    public string? CdsvnStatus { get; set; }

    public string? CdsvnChangeReason { get; set; }

    public string CdsvnSnapshot { get; set; } = null!;

    public DateTime CdsvnCreatedAt { get; set; }

    public Guid? CdsvnCreatedBy { get; set; }

    public virtual CdsDeclaration CdsvnCds { get; set; } = null!;

    public virtual SysCustomsDeclarationStatus? CdsvnStatusNavigation { get; set; }
}
