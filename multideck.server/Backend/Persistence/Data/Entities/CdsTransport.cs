using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsTransport
{
    public Guid CdstrId { get; set; }

    public Guid CdstrCdsid { get; set; }

    public string CdstrTransportStage { get; set; } = null!;

    public string? CdstrModeOfTransport { get; set; }

    public string? CdstrIdentity { get; set; }

    public string? CdstrNationalityCodeSnapshot { get; set; }

    public string? CdstrConveyanceReference { get; set; }

    public string CdstrBorderTransportMeansJson { get; set; } = null!;

    public DateTime CdstrCreatedAt { get; set; }

    public virtual CdsDeclaration CdstrCds { get; set; } = null!;

    public virtual SysCustomsTransportMode? CdstrModeOfTransportNavigation { get; set; }
}
