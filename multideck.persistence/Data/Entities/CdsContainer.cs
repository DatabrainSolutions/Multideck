using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsContainer
{
    public Guid CdscnId { get; set; }

    public Guid CdscnCdsid { get; set; }

    public Guid? CdscnCdsitemId { get; set; }

    public string CdscnContainerNumber { get; set; } = null!;

    public string CdscnSealNumbersJson { get; set; } = null!;

    public DateTime CdscnCreatedAt { get; set; }

    public virtual CdsDeclaration CdscnCds { get; set; } = null!;

    public virtual CdsItem? CdscnCdsitem { get; set; }
}
