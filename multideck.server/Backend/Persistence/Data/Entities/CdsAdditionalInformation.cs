using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsAdditionalInformation
{
    public Guid CdsaiId { get; set; }

    public Guid CdsaiCdsid { get; set; }

    public Guid? CdsaiCdsitemId { get; set; }

    public string CdsaiCode { get; set; } = null!;

    public string? CdsaiText { get; set; }

    public string CdsaiJson { get; set; } = null!;

    public DateTime CdsaiCreatedAt { get; set; }

    public virtual CdsDeclaration CdsaiCds { get; set; } = null!;

    public virtual CdsItem? CdsaiCdsitem { get; set; }
}
